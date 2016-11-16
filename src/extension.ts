// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import { commands, CancellationToken, Disposable, ExtensionContext, StatusBarAlignment, StatusBarItem, TextDocument, Uri, window, workspace } from 'vscode';
import * as Promise from 'bluebird';

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: ExtensionContext) {
    console.log('code-git activating');

    let codeGitController = new CodeGitController();

    context.subscriptions.push(codeGitController);

    console.log('code-git activated');
}

class WordCounter {
    private statusBarItem: StatusBarItem;

    public updateWordCount() {
        if (!this.statusBarItem) {
            this.statusBarItem = window.createStatusBarItem(StatusBarAlignment.Left);
        }

        let editor = window.activeTextEditor;
        if (!editor) {
            this.statusBarItem.hide();
            return;
        }

        let doc = editor.document;
        if (doc.languageId === 'markdown') {
            let wordCount = this.getWordCount(doc);
            this.statusBarItem.text = wordCount !== 1 ? `${wordCount} words` : '1 word';
            this.statusBarItem.show();
        } else {
            this.statusBarItem.hide();
        }
    }

    private getWordCount(doc: TextDocument): Number {
        console.log('updating word count');
        let content = doc.getText()
            .replace(/(< ([^>]+)<)/g, '')
            .replace(/\s+/g, ' ')
            .replace(/^\s+/, '')
            .replace(/\s+$/, '');
        console.log(`cleaned content is ${content}`);
        return content.length > 0
            ? content.split(' ').length
            : 0;
    }

    dispose() {
        this.statusBarItem.dispose();
    }
}

class CodeGitStatusContentProvider {
    public provideTextDocumentContent(uri: Uri, token: CancellationToken): string | Thenable<string> {
        console.log(`providing content for ${uri.toString()}, cancelled ${token.isCancellationRequested}`);
        return Promise.resolve('morjestaaaa');
    }
}

class CodeGitController {
    private disposable: Disposable
    private contentProvider: CodeGitStatusContentProvider

    constructor() {
        let subscriptions: Disposable[] = [];
        this.contentProvider = new CodeGitStatusContentProvider();
        workspace.registerTextDocumentContentProvider('codegit', this.contentProvider);
        subscriptions.push(commands.registerCommand('extension.openGitStatus', this.openGitStatus, this));
        this.disposable = Disposable.from(...subscriptions);
    }

    dispose() {
        this.disposable.dispose();
    }

    private openGitStatus() {
        workspace.openTextDocument(Uri.parse('codegit:status'))
            .then((document) => {
                console.log('opened doc, showing editor');
                window.showTextDocument(document)
                    .then((editor) => {
                        console.log('editor displayed');
                    });
            }, (err) => {
                console.error(`failed to open doc: ${err}`);
            });
    }

    private onEvent() {

    }
}

export function deactivate() {
    console.log('code-git deactivating');
    console.log('code-git deactivated');
}

