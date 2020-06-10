import * as vscode from 'vscode';

import { YbTaskProvider } from './ybTaskProvider';

export function activate(context: vscode.ExtensionContext) {
	const taskProvider = new YbTaskProvider();
	context.subscriptions.push(taskProvider);
	const taskProviderRegistry = vscode.tasks.registerTaskProvider(YbTaskProvider.YbType, taskProvider);
	context.subscriptions.push(taskProviderRegistry);

	context.subscriptions.push(vscode.commands.registerTextEditorCommand('yourbase.openFileConfiguration', openFileConfiguration));
	context.subscriptions.push(vscode.commands.registerCommand('yourbase.openWorkspaceConfiguration', openWorkspaceConfiguration));
}

export function deactivate() {
}

async function openFileConfiguration(textEditor: vscode.TextEditor, _edit: vscode.TextEditorEdit): Promise<vscode.TextEditor | undefined> {
	const documentUri = textEditor.document.uri;
	if (documentUri.scheme === 'untitled') {
		await vscode.window.showErrorMessage('No YourBase build configuration for untitled file.');
		return undefined;
	}
	const configUri = await findConfig(vscode.workspace.fs, documentUri);
	if (!configUri) {
		const baseName = slashPathBase(documentUri.path);
		await vscode.window.showErrorMessage('Could not find YourBase build configuration for ' + baseName + '.');
		return undefined;
	}
	return await vscode.window.showTextDocument(configUri, {
		preview: true,
	});
}

async function openWorkspaceConfiguration(folder?: vscode.WorkspaceFolder): Promise<vscode.TextEditor | undefined> {
	let configUri: vscode.Uri;
	if (folder) {
		const maybeConfigUri = await findConfig(vscode.workspace.fs, folder.uri) ??
			defaultWorkspaceConfiguration(folder);
		if (!maybeConfigUri) {
			await vscode.window.showErrorMessage('Could not find YourBase build configuration for ' + slashPathBase(folder.uri.path) + '.');
			return undefined;
		}
		configUri = maybeConfigUri;
	} else {
		if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
			await vscode.window.showErrorMessage('Cannot open YourBase build configuration: there are no folders in the workspace.');
			return undefined;
		}
		if (vscode.workspace.workspaceFolders.length === 1) {
			folder = vscode.workspace.workspaceFolders[0];
			const maybeConfigUri = await findConfig(vscode.workspace.fs, folder.uri) ??
				defaultWorkspaceConfiguration(folder);
			if (!maybeConfigUri) {
				await vscode.window.showErrorMessage('Could not find YourBase build configuration for ' + slashPathBase(folder.uri.path) + '.');
				return undefined;
			}
			configUri = maybeConfigUri;
		} else {
			const sel = await vscode.window.showQuickPick(getWorkspaceConfigurationMenuItems(), {
				placeHolder: 'Folder'
			});
			if (!sel) {
				return undefined;
			}
			folder = sel.folder;
			configUri = sel.configUri;
		}
	}
	return await vscode.window.showTextDocument(configUri, {
		preview: true,
	});
}

type WorkspaceConfigurationItem = vscode.QuickPickItem & {
	folder: vscode.WorkspaceFolder;
	configUri: vscode.Uri;
};

/**
 * Find the .yourbase.yml files for each workspace folder concurrently and
 * return a list of items for the user to choose from.
 */
async function getWorkspaceConfigurationMenuItems(): Promise<WorkspaceConfigurationItem[]> {
	if (!vscode.workspace.workspaceFolders) {
		return [];
	}
	const results = await Promise.all(vscode.workspace.workspaceFolders.map(async (folder) => {
		const maybeConfigUri = await findConfig(vscode.workspace.fs, folder.uri);
		const configUri = maybeConfigUri ?? defaultWorkspaceConfiguration(folder);
		if (!configUri) {
			return undefined;
		}
		return {
			label: slashPathBase(folder.uri.path),
			description: maybeConfigUri ? undefined : '(no build configuration)',
			folder,
			configUri,
		} as WorkspaceConfigurationItem;
	}));
	const existing = results.filter((item) => item && !item.description) as WorkspaceConfigurationItem[];
	const creates = results.filter((item) => item && item.description) as WorkspaceConfigurationItem[];
	return [...existing, ...creates];
}

/**
 * Build an "untitled" URL for a .yourbase.yml file at the top of a folder.
 */
function defaultWorkspaceConfiguration(folder: vscode.WorkspaceFolder): vscode.Uri | undefined {
	if (folder.uri.scheme !== 'file') {
		// VSCode doesn't support untitled files on remote filesystems.
		// https://github.com/microsoft/vscode/issues/62883
		return undefined;
	}
	return vscode.Uri.joinPath(folder.uri.with({scheme: 'untitled'}), '.yourbase.yml');
}

interface Statter {
	stat(uri: vscode.Uri): Thenable<vscode.FileStat>;
}

/**
 * Find the closest .yourbase.yml file to a given URI.
 * @param u URI of a file or folder
 */
async function findConfig(fs: Statter, u: vscode.Uri): Promise<vscode.Uri | null> {
	while (true) {
		const configUri = vscode.Uri.joinPath(u, '.yourbase.yml');
		try {
			await fs.stat(configUri);
		} catch {
			// Does not exist. Pop up.
			const next = vscode.Uri.joinPath(u, '..');
			if (u.toString(true) === next.toString(true)) {
				break;
			}
			u = next;
			continue;
		}
		return configUri;
	}
	return null;
}

/**
 * Return the final path component of a slash-separated path.
 */
function slashPathBase(p: string): string {
	const i = p.lastIndexOf('/');
	if (i < 0) {
		return p;
	}
	return p.substr(i + 1);
}
