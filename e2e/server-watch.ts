import * as fs from 'node:fs';
import * as path from 'node:path';

export function startServerWatch() {
  const url = 'http://localhost:5173/';
  const pollInterval = 3000;
  
  let lastSuccessTime: number | null = null;
  let firstFailureTime: number | null = null;
  let firstFailureError: string | null = null;
  let hasFailed = false;
  let cameBack = false;
  let timeoutId: NodeJS.Timeout;

  const logFile = path.join(process.cwd(), 'server-watch.log');

  const writeState = () => {
    try {
      const content = [
        `Last successful response: ${lastSuccessTime ? new Date(lastSuccessTime).toISOString() : 'Never'}`,
        `First failure: ${firstFailureTime ? new Date(firstFailureTime).toISOString() : 'None'}`,
        `Error: ${firstFailureError || 'None'}`,
        `Came back: ${cameBack ? 'Yes' : 'No'}`,
      ].join('\n') + '\n';
      fs.writeFileSync(logFile, content, 'utf8');
    } catch (e) {
      // Ignore
    }
  };

  const poll = async () => {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(new Error('Timeout')), 2000);
      
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);
      if (!res) throw new Error('No response'); // Just to read it
      
      // We don't strictly require res.ok because even a 404 means the server is answering.
      // But Vite usually returns 200 for index.html. Let's just check that fetch didn't throw.
      lastSuccessTime = Date.now();
      if (hasFailed && !cameBack) {
        cameBack = true;
        console.error(`\n[SERVER WATCH] ⚠️ The dev server at ${url} CAME BACK!`);
        writeState();
      }
    } catch (err: any) {
      if (!hasFailed) {
        hasFailed = true;
        firstFailureTime = Date.now();
        firstFailureError = err.message || String(err);
        
        console.error(`\n[SERVER WATCH] 🚨 The dev server at ${url} STOPPED ANSWERING!`);
        console.error(`[SERVER WATCH] Recorded failure state in ${logFile}\n`);
        
        writeState();
      }
    }
    timeoutId = setTimeout(poll, pollInterval);
    timeoutId.unref();
  };

  // Start polling
  poll();

  return () => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  };
}
