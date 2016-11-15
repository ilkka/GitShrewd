// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import { commands, Disposable, ExtensionContext, StatusBarAlignment, StatusBarItem, TextDocument, window } from 'vscode';

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: ExtensionContext) {
    console.log('code-git activating');

    let wordCounter = new WordCounter();
    let wordCountController = new WordCounterController(wordCounter);

    context.subscriptions.push(wordCounter);
    context.subscriptions.push(wordCountController);

    console.log('code-git activated');
}

class WordCounter {
  private statusBarItem : StatusBarItem;

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

  private getWordCount(doc : TextDocument) : Number {
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

class WordCounterController {
  private wordCounter: WordCounter
  private disposable: Disposable

  constructor(wordCounter: WordCounter) {
    this.wordCounter = wordCounter;

    let subscriptions: Disposable[] = [];
    window.onDidChangeActiveTextEditor(this.onEvent, this, subscriptions);
    window.onDidChangeTextEditorSelection(this.onEvent, this, subscriptions);

    this.wordCounter.updateWordCount();
    this.disposable = Disposable.from(...subscriptions);
  }

  dispose() {
    this.disposable.dispose();
  }

  private onEvent() {
    this.wordCounter.updateWordCount();
  }
}

export function deactivate() {
  console.log('code-git deactivating');
  console.log('code-git deactivated');
}

