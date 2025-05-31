import chokidar, { FSWatcher } from 'chokidar'; // Use default import for the module and named import for FSWatcher
import { Stats } from 'fs';
import { spawn, ChildProcess } from 'child_process';
import path from 'path';

// Define an array of actual file/directory modification events we care about for restarts
const relevantFileEvents: string[] = ['add', 'addDir', 'change', 'unlink', 'unlinkDir'];

interface StdioServerProcess {
  serverDetails: any; // TODO: Replace 'any' with a specific type, e.g., ManagedMcpServer from db-models
  process: ChildProcess | null;
  restarting: boolean;
  startCallback: () => ChildProcess;
}

/**
 * @class DevWatcher
 * @description Watches stdio-based MCP servers for file changes and restarts them.
 */
export class DevWatcher {
  private watchedServers: Map<string, StdioServerProcess> = new Map();
  private watcher: FSWatcher | null = null; // Use the imported FSWatcher type
  private globalWatchPaths: string[];
  // Using 'any' for chokidarOptions as a temporary workaround for persistent type issues.
  // This should be revisited if a more precise type can be found/fixed.
  private chokidarOptions: any; 

  constructor(globalWatchPaths: string[] = []) {
    this.globalWatchPaths = globalWatchPaths.map(p => path.resolve(p));
    this.chokidarOptions = {
        ignored: /(^|[\/\\])\.+/, 
        persistent: true,
        ignoreInitial: true,
        // awaitWriteFinish: { 
        //   stabilityThreshold: 2000,
        //   pollInterval: 100
        // }
    };

    if (this.globalWatchPaths.length > 0) {
      this.watcher = chokidar.watch(this.globalWatchPaths, this.chokidarOptions);
      // Chokidar's 'all' event provides (event: string, path: string, stats?: fs.Stats)
      this.watcher.on('all', (event: string, filePath: string, stats?: Stats) => 
        this.handleFileChange(event, path.resolve(filePath), stats)
      );
      console.log('[DevWatcher] Initialized for global paths:', this.globalWatchPaths);
    } else {
      console.log('[DevWatcher] Initialized without global paths. Will watch server-specific paths if provided.');
    }
  }

  // Event is now typed as string, filtering for relevant events is done inside
  private handleFileChange(event: string, resolvedFilePath: string, stats?: Stats) {
    if (!relevantFileEvents.includes(event)) {
        return;
    }

    console.log(`[DevWatcher] File ${resolvedFilePath} (event: ${event}) triggered check.`);
    this.watchedServers.forEach((serverProc, serverId) => {
      if (serverProc.serverDetails.serverType !== 'stdio') return;

      const serverWatchPaths: string[] = Array.isArray(serverProc.serverDetails.watchPaths) 
        ? serverProc.serverDetails.watchPaths.map((p:string) => path.resolve(p))
        : [];
        
      let isRelevant = serverWatchPaths.some(watchPath => resolvedFilePath.startsWith(watchPath));

      if (!isRelevant && this.globalWatchPaths.length > 0) {
        isRelevant = this.globalWatchPaths.some(watchPath => resolvedFilePath.startsWith(watchPath));
      }
      
      if (isRelevant) {
        console.log(`[DevWatcher] Relevant change for stdio server ${serverId}. Restarting.`);
        this.restartServer(serverId);
      }
    });
  }

  public addServer(
    serverId: string, 
    serverDetails: any, 
    startServerCallback: () => ChildProcess
  ): void {
    if (serverDetails.serverType !== 'stdio' || !serverDetails.connectionDetails?.command) {
      console.log(`[DevWatcher] Server ${serverId} is not an stdio server or has no command. Not watching.`);
      return;
    }

    if (this.watchedServers.has(serverId)) {
      console.log(`[DevWatcher] Server ${serverId} is already being watched. Updating details (removing old first).`);
      this.removeServer(serverId); 
    }
    
    const initialProcess = startServerCallback();
    this.watchedServers.set(serverId, {
      serverDetails,
      process: initialProcess,
      restarting: false,
      startCallback: startServerCallback,
    });

    console.log(`[DevWatcher] Added stdio server ${serverId} for watching. Command: ${serverDetails.connectionDetails.command}`);

    const serverSpecificWatchPaths = Array.isArray(serverDetails.watchPaths) 
        ? serverDetails.watchPaths.map((p:string) => path.resolve(p))
        : [];

    if (serverSpecificWatchPaths.length > 0) {
      if (!this.watcher) { 
        this.watcher = chokidar.watch(serverSpecificWatchPaths, this.chokidarOptions);
        this.watcher.on('all', (event: string, filePath: string, stats?: Stats) => 
          this.handleFileChange(event, path.resolve(filePath), stats)
        );
        console.log('[DevWatcher] Initialized new watcher for server-specific paths:', serverSpecificWatchPaths);
      } else { 
        this.watcher.add(serverSpecificWatchPaths);
        console.log('[DevWatcher] Added server-specific paths to existing watcher:', serverSpecificWatchPaths);
      }
    }
  }

  public removeServer(serverId: string): void {
    const serverProc = this.watchedServers.get(serverId);
    if (serverProc) {
      if (serverProc.process && !serverProc.process.killed) {
        console.log(`[DevWatcher] Stopping process for server ${serverId} (PID: ${serverProc.process.pid}).`);
        const killed = serverProc.process.kill('SIGTERM');
        if (!killed) {
            console.warn(`[DevWatcher] SIGTERM failed for PID ${serverProc.process.pid}. Process might already be dead or unresponsive.`);
        }
      }
      
      const pathsToRemove = Array.isArray(serverProc.serverDetails.watchPaths) 
        ? serverProc.serverDetails.watchPaths.map((p:string) => path.resolve(p))
        : [];

      if (this.watcher && pathsToRemove.length > 0) {
        const allOtherWatchedPaths = new Set<string>();
        this.globalWatchPaths.forEach(p => allOtherWatchedPaths.add(p));
        this.watchedServers.forEach((proc, sId) => {
          if (sId !== serverId) {
            const otherSpecificPaths = Array.isArray(proc.serverDetails.watchPaths)
                ? proc.serverDetails.watchPaths.map((p:string) => path.resolve(p))
                : [];
            otherSpecificPaths.forEach((p: string) => allOtherWatchedPaths.add(p));
          }
        });
        const trulyUniquePaths = pathsToRemove.filter((p: string) => !allOtherWatchedPaths.has(p));
        if (trulyUniquePaths.length > 0) {
          this.watcher.unwatch(trulyUniquePaths);
          console.log('[DevWatcher] Unwatched server-specific paths:', trulyUniquePaths);
        }
      }

      this.watchedServers.delete(serverId);
      console.log(`[DevWatcher] Removed server ${serverId} from watching.`);
    }
  }

  private restartServer(serverId: string): void {
    const serverProc = this.watchedServers.get(serverId);
    if (!serverProc || serverProc.restarting) {
      return;
    }

    serverProc.restarting = true;
    console.log(`[DevWatcher] Attempting to restart server ${serverId}...`);

    const killProcess = (proc: ChildProcess, signal: NodeJS.Signals = 'SIGTERM'): Promise<void> => {
        return new Promise((resolve) => {
            if (!proc || proc.killed) {
                resolve();
                return;
            }
            let resolved = false;
            const timeoutMs = 5000; // 5 seconds for graceful shutdown

            const timer = setTimeout(() => {
                if (!resolved) {
                    console.warn(`[DevWatcher] Timeout waiting for process ${proc.pid} to exit with ${signal}. Attempting SIGKILL.`);
                    if (!proc.killed) { // Check if not already killed by another means or exited
                        proc.kill('SIGKILL'); // Force kill
                    }
                    // Resolve after attempting SIGKILL, assuming it will eventually terminate or is already gone.
                    // Further checks could be added here if SIGKILL itself can fail silently on some platforms/conditions.
                    resolve(); 
                }
            }, timeoutMs);

            proc.once('exit', (code, exitSignal) => {
                if (!resolved) {
                    resolved = true;
                    clearTimeout(timer);
                    console.log(`[DevWatcher] Process ${proc.pid} exited with code ${code}, signal ${exitSignal}.`);
                    resolve();
                }
            });
            proc.once('error', (err) => {
                if (!resolved) {
                    resolved = true;
                    clearTimeout(timer);
                    console.error(`[DevWatcher] Error killing process ${proc.pid}:`, err);
                    resolve(); // Resolve even on error to allow restart attempt
                }
            });
            
            if (!proc.kill(signal)) {
                // If kill returns false, it might mean the process is already dead or doesn't exist.
                // The 'exit' or 'error' event should ideally still fire or have fired.
                // If it doesn't, the timeout will handle it.
                // We added a check for !proc.killed before this block in some versions,
                // but proc.kill() itself is the action. If it fails, log it.
                if (!proc.killed && !resolved) { 
                    console.warn(`[DevWatcher] proc.kill(${signal}) returned false for PID ${proc.pid}. Process might already be dead or unkillable by this signal.`);
                }
                // No immediate resolve here; let events or timeout determine resolution.
            }
        });
    };

    const oldProcess = serverProc.process;
    serverProc.process = null; 

    Promise.resolve()
        .then(() => {
            if (oldProcess && !oldProcess.killed) {
                console.log(`[DevWatcher] Killing existing process for server ${serverId} (PID: ${oldProcess.pid}) with SIGTERM.`);
                return killProcess(oldProcess, 'SIGTERM');
            }
            return Promise.resolve();
        })
        .then(() => {
            return new Promise(resolve => setTimeout(resolve, 100)); 
        })
        .then(() => {
            console.log(`[DevWatcher] Old process for server ${serverId} presumed stopped. Starting new one.`);
            const newProcess = serverProc.startCallback();
            const currentServerProcState = this.watchedServers.get(serverId);
            if (currentServerProcState) { // Check if serverProc still exists in map
                currentServerProcState.process = newProcess;
                currentServerProcState.restarting = false;
                console.log(`[DevWatcher] New process for server ${serverId} spawned (PID: ${newProcess.pid}).`);
            } else {
                console.warn(`[DevWatcher] Server ${serverId} was removed during restart. New process (PID: ${newProcess.pid}) started but not tracked. Killing.`);
                newProcess.kill();
            }
        })
        .catch(error => {
            console.error(`[DevWatcher] Error restarting server ${serverId}:`, error);
            const currentServerProcState = this.watchedServers.get(serverId);
            if (currentServerProcState) {
                currentServerProcState.restarting = false;
                currentServerProcState.process = null; 
            }
        });
  }

  public stopAll(): void {
    if (this.watcher) {
      this.watcher.close();
      console.log('[DevWatcher] File watcher stopped.');
    }
    this.watchedServers.forEach((serverProc, serverId) => {
      if (serverProc.process && !serverProc.process.killed) {
        console.log(`[DevWatcher] Stopping process for server ${serverId} (PID: ${serverProc.process.pid}).`);
        serverProc.process.kill('SIGTERM');
        setTimeout(() => {
            if (serverProc.process && !serverProc.process.killed) {
                console.warn(`[DevWatcher] Process ${serverProc.process.pid} for server ${serverId} did not stop with SIGTERM. Sending SIGKILL.`);
                serverProc.process.kill('SIGKILL');
            }
        }, 2000); // 2 seconds grace period
      }
    });
    this.watchedServers.clear();
    console.log('[DevWatcher] All watched servers stopped and cleared.');
  }
}
