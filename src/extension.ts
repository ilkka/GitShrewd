// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import { commands, CancellationToken, Disposable, ExtensionContext, StatusBarAlignment, StatusBarItem, TextDocument, TextEditor, Uri, window, workspace } from 'vscode';
import * as Promise from 'bluebird';
import * as simpleGit from 'simple-git/promise';

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: ExtensionContext) {
    console.log('code-git activating');

    let codeGitController = new CodeGitController();

    context.subscriptions.push(codeGitController);

    console.log('code-git activated');
}

class CodeGitStatusContentProvider {
    public provideTextDocumentContent(uri: Uri, token: CancellationToken): string | Thenable<string> {
        if (uri.path === 'status') {
            if (workspace.rootPath) {
                return this.provideStatusContent();
            }
            return Promise.resolve('No folder open');
        }
        return Promise.reject(`unrecognized URI ${uri}`);
    }

    private provideStatusContent(): string | Thenable<string> {
        const git = simpleGit(workspace.rootPath);
        return git.status()
        .then((stat) => {
            return `git status: ${JSON.stringify(stat, null, 2)}`;
        })
        .catch((err) => {
            console.error(`error getting git status: ${err}`);
            return `error getting git status: ${err}`;
        });
    }
}

class CodeGitController {
    private subscriptions: Disposable[];
    private disposable: Disposable
    private contentProvider: CodeGitStatusContentProvider
    private view: TextEditor;
    private keypressDisposable: Disposable;

    constructor() {
        this.subscriptions = [];
        this.contentProvider = new CodeGitStatusContentProvider();
        workspace.registerTextDocumentContentProvider('codegit', this.contentProvider);
        this.registerCommand('extension.openGitStatus', this.openGitStatus);
    }

    dispose() {
        this.disposable.dispose();
    }

    /**
     * Eventually dispose of the disposable (when the extension is deactivated).
     * @param {Disposable} d the disposable.
     * @return {Disposable} the disposable.
     */
    private eventuallyDispose(d: Disposable): Disposable {
        this.subscriptions.push(d);
        this.disposable = Disposable.from(...this.subscriptions);
        return d;
    }

    /**
     * Register a handler for a command. The handler must be a member of this class.
     * @param {string} command the command.
     * @param {Function} handler the handler function.
     * @return {Disposable} disposable for the registration.
     */
    private registerCommand(command: string, handler: (...args: any[]) => any): Disposable {
        return this.eventuallyDispose(commands.registerCommand(command, handler, this));
    }

    private keyPress(what) {
        console.log(`KEYPRESS! ${what.text}`);
    }

    private openGitStatus() {
        workspace.openTextDocument(Uri.parse('codegit:status'))
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
                        this.keypressDisposable = this.registerCommand('type', this.keyPress);
                    });
            }, (err) => {
                console.error(`failed to open doc: ${err}`);
            });
    }
}

export function deactivate() {
    console.log('code-git deactivating');
    console.log('code-git deactivated');
}

