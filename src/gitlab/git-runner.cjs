const { spawn } = require('node:child_process');

class GitRunner {
  constructor(options = {}) {
    this.gitPath = options.gitPath || '/usr/bin/git';
    this.processes = new Set();
  }

  run(args, options = {}) {
    const cwd = options.cwd || undefined;
    const signal = options.signal;
    const onOutput = typeof options.onOutput === 'function' ? options.onOutput : null;
    return new Promise((resolve, reject) => {
      const child = spawn(this.gitPath, args.map(String), {
        cwd,
        shell: false,
        env: {
          ...process.env,
          GIT_TERMINAL_PROMPT: '0',
          GIT_PROGRESS_DELAY: '0'
        }
      });
      this.processes.add(child);
      let stdout = '';
      let stderr = '';
      let settled = false;

      const abort = () => {
        if (child.exitCode === null) child.kill('SIGTERM');
      };
      if (signal) {
        if (signal.aborted) abort();
        signal.addEventListener('abort', abort, { once: true });
      }

      child.stdout.on('data', (data) => {
        const text = data.toString('utf8');
        stdout += text;
        emitLines(text, 'stdout', onOutput);
      });
      child.stderr.on('data', (data) => {
        const text = data.toString('utf8');
        stderr += text;
        emitLines(text, 'stderr', onOutput);
      });
      child.on('error', (error) => {
        if (settled) return;
        settled = true;
        this.processes.delete(child);
        if (signal) signal.removeEventListener('abort', abort);
        reject(error);
      });
      child.on('close', (code) => {
        if (settled) return;
        settled = true;
        this.processes.delete(child);
        if (signal) signal.removeEventListener('abort', abort);
        resolve({
          exitCode: Number(code),
          stdout,
          stderr,
          succeeded: Number(code) === 0
        });
      });
    });
  }

  terminateAll() {
    for (const child of this.processes) {
      if (child.exitCode === null) child.kill('SIGTERM');
    }
  }
}

function emitLines(text, stream, onOutput) {
  if (!onOutput) return;
  String(text || '')
    .split(/\r?\n/)
    .filter(Boolean)
    .forEach((line) => onOutput({ stream, message: line }));
}

module.exports = { GitRunner };
