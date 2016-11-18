// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import { commands, CancellationToken, Disposable, ExtensionContext, StatusBarAlignment, StatusBarItem, TextDocument, TextEditor, TextEditorLineNumbersStyle, Uri, window, workspace } from 'vscode';
import * as Promise from 'bluebird';

import GitViewContentProvider from './GitViewContentProvider';
import GitViewController from './GitViewController';

/**
 * Called when the extension is activated.
 */
export function activate(context: ExtensionContext) {
    console.log('GitShrewd activating');

    let gitViewController = new GitViewController();

    context.subscriptions.push(gitViewController);

    console.log('GitShrewd activated');
}

/**
 * Deactivate handler, called when the extension is unloaded.
 */
export function deactivate() {
    console.log('GitShrewd deactivating');
    console.log('GitShrewd deactivated');
}
