import * as vscode from 'vscode';
import { YbTaskProvider } from './ybTaskProvider';

export function activate(context: vscode.ExtensionContext) {
	const taskProvider = new YbTaskProvider();
	context.subscriptions.push(taskProvider);
	const taskProviderRegistry = vscode.tasks.registerTaskProvider(YbTaskProvider.YbType, taskProvider);
	context.subscriptions.push(taskProviderRegistry);
}

export function deactivate() {
}
