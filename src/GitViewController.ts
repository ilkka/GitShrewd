/// <reference path="./spawn-rx.d.ts" />
import {
    commands,
    Disposable,
    Position,
    Range,
    Selection,
    TextDocument,
    TextEditor,
    TextEditorLineNumbersStyle,
    TextEditorRevealType,
    Uri,
    window,
    workspace
} from 'vscode';
import * as thenify from 'thenify';
import { stat, unlink } from 'fs';
import * as path from 'path';
import * as simpleGit from 'simple-git';
import { spawnPromise } from 'spawn-rx';
import GitViewContentProvider from './GitViewContentProvider';

const statP = thenify(stat);
const unlinkP = thenify(unlink);

const commitMsgFilename = '.git/COMMIT_EDITMSG';

const gitCommitComment = `
# Please enter the commit message for your changes. Lines starting
# with '#' will be ignored, and an empty message aborts the commit.
%%STATUS%%
# ------------------------ >8 ------------------------
# Do not touch the line above.
# Everything below will be removed.
`;

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
        if (what.text === 'r') {
            this.contentProvider.refreshStatus();
        } else if (what.text === 's') {
            return this.stageCurrent();
        } else if (what.text === 'u') {
            return this.unstageCurrent();
        } else if (what.text === 'c') {
            return this.commitStaged();
        }
    }

    /**
     * Open a git status view.
     */
    private openGitStatus() {
        workspace.openTextDocument(Uri.parse('gitshrewd:status'))
            .then((document) => {
                console.log('opened status doc, showing editor');
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

    /**
     * Get file under cursor
     */
    private getFocusedFile() {
        return this.view.document.lineAt(this.view.selection.active.line).text.trim();
    }

    /**
     * Turn workspace root relative path to absolute path.
     */
    private static toAbsoluteWorkspacePath(workspacePath: string) {
        return path.join(workspace.rootPath, workspacePath);
    }

    /**
     * Check if the given workspace-relative path is a file that exists.
     *
     * @param {string} relpath relative path.
     * @return {Promise<boolean>} true if relpath is a workspace file.
     */
    private static isWorkspaceFile(relpath: string) {
        return statP(GitViewController.toAbsoluteWorkspacePath(relpath))
            .then(stats => stats.isFile())
            .catch(() => false);
    }

    /**
     * Stage currently focused file.
     */
    private stageCurrent() {
        const filename = this.getFocusedFile()
        return GitViewController.isWorkspaceFile(filename)
            .then(isfile => {
                const git = simpleGit(workspace.rootPath);
                const add = thenify(git.add);
                return add.call(git, [filename]);
            })
            .then(() => this.contentProvider.refreshStatus())
            .catch((err) => {
                console.error(`Error staging file: ${err}`);
                return this.contentProvider.refreshStatus();
            });
    }

    /**
     * Unstage currently focused file
     */
    private unstageCurrent() {
        const filename = this.getFocusedFile();
        // TODO: this is not good, we should be able to unstage
        // a file that no longer exists in the filesystem.
        return GitViewController.isWorkspaceFile(filename)
            .then(isfile => {
                const git = simpleGit(workspace.rootPath);
                const reset = thenify(git.reset);
                return reset.call(git, [
                    GitViewController.toAbsoluteWorkspacePath(filename)
                ]);
            })
            .then(() => this.contentProvider.refreshStatus())
            .catch((err) => {
                console.error(`Error unstaging file: ${err}`);
                return this.contentProvider.refreshStatus();
            });
    }

    /**
     * Commit staged
     */
    private commitStaged() {
        return Promise.all([
            spawnPromise('git', ['status'], { cwd: workspace.rootPath }),
            spawnPromise('git', ['diff'], { cwd: workspace.rootPath }),
        ]).then(([statusOutput, diffOutput]) => {
            const commentedStatus = '# ' + statusOutput.replace(/([\n])/g, '$1# ');
            const combined =
                gitCommitComment.replace(/%%STATUS%%/, commentedStatus) + diffOutput;
            // open commit msg editor
            return Promise.resolve(GitViewController.isWorkspaceFile(commitMsgFilename))
            .then(exists => exists
                ? unlinkP(GitViewController.toAbsoluteWorkspacePath(commitMsgFilename))
                : true
            )
            .then(() => workspace.openTextDocument(
                Uri.parse(`untitled:${GitViewController.toAbsoluteWorkspacePath(commitMsgFilename)}`)
            ))
            .then(doc => window.showTextDocument(doc))
            .then(editor => editor.edit((editBuilder) => {
                editBuilder.insert(new Position(0, 0), combined);
            }).then(() => {
                editor.selection = new Selection(new Position(0, 0), new Position(0, 0));
                editor.revealRange(new Range(0, 0, 0, 0), TextEditorRevealType.Default);
            }));
        }).catch((err) => {
            console.error(`commit failed: ${err}`);
        });
    }
}
