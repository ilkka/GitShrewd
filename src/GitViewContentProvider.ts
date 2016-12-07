import { commands, CancellationToken, Disposable, ExtensionContext, StatusBarAlignment, StatusBarItem, TextDocument, TextEditor, TextEditorLineNumbersStyle, Uri, window, workspace } from 'vscode';
import * as thenify from 'thenify';
import * as simpleGit from 'simple-git';

/**
 * This class is responsible for generating all our git view content.
 * The controller calls its methods, it announces to its listeners about content changes,
 * the listeners call provideTextDocumentContent(), and it returns the content.
 */
export default class GitViewContentProvider {
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
                    this.provideStatusContent(),
                    this.provideShortcutHelp()
                ]).then((content: string[]): string =>
                    content.reduce((memo, val) => memo += `${val}\n`, '')
                );
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
        const gitStatus = thenify(git.status);
        return gitStatus.call(git)
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

    /**
     * Return shortcut key help
     */
    private  provideShortcutHelp(): Thenable<string> {
        return Promise.resolve(`COMMANDS:
[s]tage current
[u]nstage current
[c]ommit staged
[r]efresh view`);
    }


}
