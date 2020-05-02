import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import * as yaml from 'yaml';

export class YbTaskProvider implements vscode.Disposable, vscode.TaskProvider {
  static YbType: string = 'yb';
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
    if (task.definition.type !== YbTaskProvider.YbType) {
      return undefined;
    }
    const defn = task.definition as Partial<YbTaskDefinition>;
    if (!defn.target) {
      return undefined;
    }
    task.execution = taskExecution(defn.target);
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
  private _tasksPromise: Thenable<vscode.Task[]> | undefined;

  constructor(folder: vscode.WorkspaceFolder) {
    this.folder = folder;
    const pattern = path.join(folder.uri.fsPath, '.yourbase.yml');
    this.buildFileWatcher = vscode.workspace.createFileSystemWatcher(pattern);
    this.buildFileWatcher.onDidChange(() => this._tasksPromise = undefined);
    this.buildFileWatcher.onDidCreate(() => this._tasksPromise = undefined);
    this.buildFileWatcher.onDidDelete(() => this._tasksPromise = undefined);
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
  }
}

interface YbTaskDefinition extends vscode.TaskDefinition {
  readonly type: 'yb';
  readonly target: string;
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
  return parsed.build_targets.map((target: YbBuildTarget) => {
    const task = new vscode.Task(
      {
        type: YbTaskProvider.YbType,
        target: target.name,
      } as YbTaskDefinition,
      folder,
      'yb build ' + target.name,
      'yb',
      taskExecution(target.name),
    );
    task.group = vscode.TaskGroup.Build;
    return task;
  });
}

function taskExecution(targetName: string): vscode.ShellExecution {
  // TODO(light): Use process execution.
  return new vscode.ShellExecution('yb build -- ' + targetName);
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
