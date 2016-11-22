import { commands, CancellationToken, Disposable, ExtensionContext, StatusBarAlignment, StatusBarItem, TextDocument, TextEditor, TextEditorLineNumbersStyle, Uri, window, workspace } from 'vscode';
import * as Promise from 'bluebird';
import { stat } from 'fs';
import * as path from 'path';
import * as simpleGit from 'simple-git';

import GitViewContentProvider from './GitViewContentProvider';

const statP = Promise.promisify(stat);

/**
 * Git view controller. This class is responsible for creating and handling
 * the editor view for interacting with the user.
 */
export default class GitViewController {
    private subscriptions: Disposable[];
    private disposable: Disposable
    private contentProvider: GitViewContentProvider
    private view: TextEditor;
    private keypressDisposable: Disposable;

    constructor() {
        this.subscriptions = [];
        this.contentProvider = new GitViewContentProvider();
        workspace.registerTextDocumentContentProvider('gitshrewd', this.contentProvider);
        this.registerCommand('extension.openGitStatus', this.openGitStatus);
    }

    dispose() {
        this.disposable.dispose();
    }

    /**
     * Eventually dispose of the disposable (when the extension is deactivated).
     *
     * @param {Disposable} d the disposable.
     *
     * @return {Disposable} the disposable.
     */
    private eventuallyDispose(d: Disposable): Disposable {
        this.subscriptions.push(d);
        this.disposable = Disposable.from(...this.subscriptions);
        return d;
    }

    /**
     * Register a handler for a command. The handler must be a member of this class.
     *
     * @param {string} command the command.
     * @param {Function} handler the handler function.
     *
     * @return {Disposable} disposable for the registration.
     */
    private registerCommand(command: string, handler: (...args: any[]) => any): Disposable {
        return this.eventuallyDispose(commands.registerCommand(command, handler, this));
    }

    /**
     * Keypress handler.
     *
     * @param {Object} what an event object with the property 'text' containing the keypress.
     */
    private keyPress(what) {
        console.log(`keypress: ${what.text}`);
        if (what.text === 'r') {
            this.contentProvider.refreshStatus();
        } else if (what.text === 'l') {
            const line = this.view.selection.active.line;
            console.log(`line: ${line}`);
            console.log(`content: ${this.view.document.lineAt(line).text}`);
        } else if (what.text === 's') {
            const filename = this.view.document.lineAt(this.view.selection.active.line).text.trim();
            const filepath = path.join(workspace.rootPath, filename);
            console.log(`checking if there is a workspace file named ${filename}`);
            statP(filepath)
                .then(stats => stats.isFile())
                .then(isfile => {
                    const git = simpleGit(workspace.rootPath);
                    const add = Promise.promisify(git.add);
                    return add.call(git, [filename]);
                })
                .then(() => this.contentProvider.refreshStatus())
                .catch((err) => {
                    console.error(`Error staging file: ${err}`);
                    return this.contentProvider.refreshStatus();
                });
        } else if (what.text === 'u') {
            const filename = this.view.document.lineAt(this.view.selection.active.line).text.trim();
            const filepath = path.join(workspace.rootPath, filename);
            // TODO: this is not good, we should be able to unstage
            // a file that no longer exists in the filesystem.
            console.log(`checking if there is a workspace file named ${filename}`);
            statP(filepath)
                .then(stats => stats.isFile())
                .then(isfile => {
                    const git = simpleGit(workspace.rootPath);
                    const reset = Promise.promisify(git.reset);
                    return reset.call(git, [filepath]);
                })
                .then(() => this.contentProvider.refreshStatus())
                .catch((err) => {
                    console.error(`Error unstaging file: ${err}`);
                    return this.contentProvider.refreshStatus();
                });
        }
    }

    /**
     * Open a git status view.
     */
    private openGitStatus() {
        workspace.openTextDocument(Uri.parse('gitshrewd:status'))
            .then((document) => {
                console.log('opened doc, showing editor');
                this.eventuallyDispose(window.onDidChangeActiveTextEditor(
                    (e: TextEditor) => {
                        if (e !== this.view && this.keypressDisposable) {
                            console.log('deactivate git kbd handler');
                             this.keypressDisposable.dispose();
                             this.keypressDisposable = null;
                        } else if (e === this.view && !this.keypressDisposable) {
                            console.log('activate git kbd handler');
                            this.keypressDisposable = this.registerCommand('type', this.keyPress);
                        }
                    }
                ));
                window.showTextDocument(document)
                    .then((editor) => {
                        this.view = editor;
                        console.log('git view displayed');
                        this.keypressDisposable = this.keypressDisposable || this.registerCommand('type', this.keyPress);
                        this.view.options = {
                            lineNumbers: TextEditorLineNumbersStyle.Off
                        };
                    });
            }, (err) => {
                console.error(`failed to open doc: ${err}`);
            });
    }
}
