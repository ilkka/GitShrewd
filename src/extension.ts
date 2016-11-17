// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import { commands, CancellationToken, Disposable, ExtensionContext, StatusBarAlignment, StatusBarItem, TextDocument, TextEditor, TextEditorLineNumbersStyle, Uri, window, workspace } from 'vscode';
import * as Promise from 'bluebird';
import * as simpleGit from 'simple-git/promise';

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

/**
 * This class is responsible for generating all our git view content.
 * The controller calls its methods, it announces to its listeners about content changes,
 * the listeners call provideTextDocumentContent(), and it returns the content.
 */
class GitViewContentProvider {
    private changeListeners: ((u: Uri) => any)[];

    /**
     * Create a new instance of the content provider.
     */
    constructor() {
        this.changeListeners = [];
    }

    /**
     * Provide text content for the given URI.
     *
     * @param {Uri} uri the URI for which the caller wants content.
     * @param {CancellationToken} token a token with which the caller can cancel the operation.
     *
     * @return {string|Thenable<string>} content for the view.
     */
    public provideTextDocumentContent(uri: Uri, token: CancellationToken): string | Thenable<string> {
        if (uri.path === 'status') {
            if (workspace.rootPath) {
                return Promise.all([
                    this.provideStatusContent()
                ]).reduce((memo: string, val: string): string => memo += `${val}\n`, '');
            }
            return Promise.resolve('No folder open');
        }
        return Promise.reject(`unrecognized URI ${uri}`);
    }

    /**
     * Subscribe to content change events. Text editors showing documents
     * that receive content from this provider call this. Returns a disposable.
     *
     * @param {Function} listener the callback function, called when content changed,
     * with the URI of the changed view as parameter.
     * @param {any} thisArg if given, context that should be bound for the listener when called.
     * @param {Disposable[]} disposables optional list of disposables, where the disposable
     * created by this function will be appended.
     *
     * @return {Disposable} a disposable which can be used to unsubscribe.
     */
    public onDidChange(listener: (u: Uri) => any, thisArg?: any, disposables?: Disposable[]): Disposable {
        let that = thisArg || this;
        let func = listener.bind(that);
        let idx = this.changeListeners.push(func) - 1;
        let dispose = () => {
            this.changeListeners[idx] = null;
        }
        let disposable = { dispose };
        if (disposables) {
            disposables.push(disposable);
        }
        return disposable;
    }

    /**
     * Request a git status view refresh.
     */
    public refreshStatus() {
        console.log('status refresh requested');
        this.notifyListeners('gitshrewd:status');
    }

    /**
     * Notify listeners that the content of a given URI has changed.
     *
     * @param {Uri} uri the URI to pass to the listeners.
     */
    private notifyListeners(uri: string) {
        for (let l of this.changeListeners) {
            l(Uri.parse(uri));
        }
    }

    /**
     * Provide git status view content.
     *
     * @return {Thenable<string>} a string with the content of the status view.
     */
    private provideStatusContent(): Thenable<string> {
        const git = simpleGit(workspace.rootPath);
        return git.status()
        .then((stat) => {
            console.log(`git status: ${JSON.stringify(stat, null, 2)}`);
            let unstaged: string[] = [];
            let staged: string[] = [];
            let output = '';
            for (let file of stat.files) {
                if (file.index === 'M') {
                    staged.push(file.path);
                }
                if (file.working_dir === 'M') {
                    unstaged.push(file.path);
                }
            }
            if (staged.length) {
                output += `STAGED:${staged.reduce((out, fn) => `${out}\n  ${fn}`, '')}\n\n`;
            }
            if (unstaged.length) {
                output += `UNSTAGED:${unstaged.reduce((out, fn) => `${out}\n  ${fn}`, '')}\n\n`;
            }
            return output;
        })
        .catch((err) => {
            console.error(`error getting git status: ${err}`);
            return `error getting git status: ${err}`;
        });
    }
}

/**
 * Git view controller. This class is responsible for creating and handling
 * the editor view for interacting with the user.
 */
class GitViewController {
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
        console.log(`KEYPRESS! ${what.text}`);
        if (what.text === 'r') {
            this.contentProvider.refreshStatus();
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
