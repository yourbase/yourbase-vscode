import * as fs from 'fs';
import * as path from 'path';
import * as process from 'process';
import * as vscode from 'vscode';
import * as yaml from 'yaml';

export class YbTaskProvider implements vscode.Disposable, vscode.TaskProvider {
  static readonly YbType: 'yb' = 'yb';
  private workspaceStates: Map<string, WorkspaceState>;
  private folderChangeListener: vscode.Disposable;

  constructor() {
    this.workspaceStates = new Map();
    if (vscode.workspace.workspaceFolders) {
      for (const folder of vscode.workspace.workspaceFolders) {
        this.addWorkspace(folder);
      }
    }
    this.folderChangeListener = vscode.workspace.onDidChangeWorkspaceFolders((e) => {
      for (const folder of e.added) {
        this.addWorkspace(folder);
      }
      for (const folder of e.removed) {
        const key = folder.uri.toString();
        const state = this.workspaceStates.get(key);
        if (state) {
          state.dispose();
        }
        this.workspaceStates.delete(key);
      }
    });
  }

  private addWorkspace(folder: vscode.WorkspaceFolder) {
    const key = folder.uri.toString();
    if (this.workspaceStates.has(key)) {
      return;
    }
    this.workspaceStates.set(key, new WorkspaceState(folder));
  }

  public async provideTasks(): Promise<vscode.Task[]> {
    // TODO(light): Cancel promise as appropriate.
    const promises = [];
    for (const state of this.workspaceStates.values()) {
      promises.push(state.tasksPromise);
    }
    const taskLists = await Promise.all(promises);
    return taskLists.reduce((acc, val) => acc.concat(val), []);
  }

  public resolveTask(task: vscode.Task): vscode.Task | undefined {
    if (!isYbTaskDefinition(task.definition) || typeof task.scope !== 'object') {
      return undefined;
    }
    task.execution = taskExecution(task.definition, workspaceUsesRemoteBuilds(task.scope));
    return task;
  }

  dispose() {
    for (const state of this.workspaceStates.values()) {
      state.dispose();
    }
    this.folderChangeListener.dispose();
  }
}

class WorkspaceState implements vscode.Disposable {
  private folder: vscode.WorkspaceFolder;
  private buildFileWatcher: vscode.FileSystemWatcher;
  private configChanged: vscode.Disposable;
  private _tasksPromise: Thenable<vscode.Task[]> | undefined;

  constructor(folder: vscode.WorkspaceFolder) {
    this.folder = folder;
    const pattern = path.join(folder.uri.fsPath, '.yourbase.yml');
    this.buildFileWatcher = vscode.workspace.createFileSystemWatcher(pattern);
    this.buildFileWatcher.onDidChange(() => this.invalidateTasks());
    this.buildFileWatcher.onDidCreate(() => this.invalidateTasks());
    this.buildFileWatcher.onDidDelete(() => this.invalidateTasks());
    this.configChanged = vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('yourbase', folder)) {
        this.invalidateTasks();
      }
    });
  }

  get tasksPromise(): Thenable<vscode.Task[]> {
    if (!this._tasksPromise) {
      this._tasksPromise = getYbTasks(this.folder);
    }
    return this._tasksPromise;
  }

  invalidateTasks(): void {
    this._tasksPromise = undefined;
  }

  dispose() {
    this.buildFileWatcher.dispose();
    this.configChanged.dispose();
  }
}

interface YbTaskDefinition extends vscode.TaskDefinition {
  readonly type: 'yb';
  readonly target: string;
}

function isYbTaskDefinition(defn: any): defn is YbTaskDefinition {
  return defn.type === YbTaskProvider.YbType && 'target' in defn;
}

async function getYbTasks(folder: vscode.WorkspaceFolder): Promise<vscode.Task[]> {
  if (!folder.uri.fsPath) {
    return [];
  }
  const buildFile = path.join(folder.uri.fsPath, '.yourbase.yml');
  if (!await exists(buildFile)) {
    return [];
  }
  const buildFileData = await readFile(buildFile);
  const parsed = yaml.parse(buildFileData);
  const remote = workspaceUsesRemoteBuilds(folder);
  return parsed.build_targets.map((target: YbBuildTarget) => {
    const definition: YbTaskDefinition = {
      type: YbTaskProvider.YbType,
      target: target.name,
    };
    const task = new vscode.Task(
      definition,
      folder,
      target.name,
      'yb',
      taskExecution(definition, remote),
    );
    task.group = vscode.TaskGroup.Build;
    return task;
  });
}

/** VSCode configuration section for this extension. */
const configSection = 'yourbase';

/** Reports whether the given workspace folder builds its targets remotely. */
function workspaceUsesRemoteBuilds(folder: vscode.WorkspaceFolder): boolean {
  return vscode.workspace.getConfiguration(configSection, folder).get('remoteBuild', false);
}

function useWsl(): boolean {
  return process.platform === 'win32' &&
    vscode.workspace.getConfiguration(configSection).get('useWSL', false);
}

/** Return the invocation for a task. */
function taskExecution(definition: YbTaskDefinition, remote: boolean): vscode.ProcessExecution {
  let process: string;
  let args: string[];
  if (!useWsl()) {
    process = 'yb';
    args = [];
  } else {
    process = 'wsl';
    args = ['yb'];
  }
  const subcmd = remote ? 'remotebuild' : 'build';
  args.push(subcmd, '--', definition.target);
  return new vscode.ProcessExecution(process, args);
}

/** YAML definition of a build target. */
interface YbBuildTarget {
  name: string;
}

function exists(file: string): Promise<boolean> {
  return new Promise<boolean>((resolve, _reject) => {
    fs.exists(file, (value) => resolve(value));
  });
}

function readFile(file: string): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    fs.readFile(file, 'utf8', (err, data) => {
      if (err) {
        reject(err);
      } else {
        resolve(data);
      }
    });
  });
}
