# better-btw

A Claude Code mod that replaces the built-in `/btw` with a side-question pane you can keep talking in.

The built-in `/btw` answers one side question and closes. better-btw keeps the pane open: type a follow-up in the field under the answer, and every question and answer of that visit stays on screen together. Like `/btw`, it answers from the current conversation, uses no tools, does not interrupt Claude's main work, and leaves nothing in the main conversation's history.

[日本語の説明は下にあります](#日本語)

## Install

At the prompt of a terminal Claude Code session:

```
/plugin install better-btw --marketplace hamTotk/better-btw
```

Answer `y` to add the marketplace, then pick a scope (the user scope is first). The mod is active at once, no restart needed.

To remove it: `claude plugin uninstall better-btw`. `/btw` is then the built-in one again.

## Use

- `/btw <question>` opens the pane and asks the first question.
- Type a follow-up in the field at the bottom and press Enter. Earlier answers in the thread are passed along, so follow-ups build on them.
- `↑` / `↓` select a question. `Enter` on a selected question opens or folds its answer. `↓` from the newest question returns to the field.
- `Esc` closes the pane. The next `/btw <question>` starts a new visit; questions from earlier visits fold to one line each above it.
- `/btw` with no question reopens the last visit as it was.
- `copy` copies the selected answer (or the latest one); `clear history` forgets every side question.
- The model is told the pane's width, and a table too wide for the pane is drawn as a list, so answers fit.

Up to 20 side questions are remembered per session. `/clear` forgets them.

## Notes

- **It replaces `/btw` for you.** Every `/btw` you type goes to this mod while it is installed. If the mod fails to load, the built-in `/btw` runs as before.
- **The mod API is early access.** It is built on Claude Code's function-hook mods, which may change between releases. Tested on Claude Code 2.1.296.
- **Install from a terminal.** The `/plugin install` line works in the terminal. Once installed at the user scope, the mod also runs in the desktop app's Code tab.

## Develop

```
claude plugin validate .
claude plugin test .
claude --plugin-dir .
```

## License

MIT

---

## 日本語

Claude Code の組み込み `/btw` を置き換えて、脇道の質問を続けて聞けるようにする mod です。

組み込みの `/btw` は質問 1 つに答えると閉じます。better-btw は画面を開いたまま、回答の下の入力欄から続けて質問できます。開いてから閉じるまでのやりとりは全部並べて表示します。組み込みと同じく、今の会話を踏まえて答え、ツールは使わず、Claude 本体の作業を止めず、メインの会話の履歴にも残りません。

### 入れ方

ターミナル版の Claude Code で次の 1 行を打ちます。

```
/plugin install better-btw --marketplace hamTotk/better-btw
```

マーケットプレイスを追加するか聞かれたら `y`、続けて入れる範囲を選びます(先頭がユーザー全体)。入れた時点で使えるようになり、再起動は要りません。

外すときは `claude plugin uninstall better-btw` です。外すと `/btw` は組み込みのものに戻ります。

### 使い方

- `/btw 質問` で画面が開き、最初の質問に答えます。
- 下の入力欄に続きの質問を打って Enter。それまでの回答を踏まえて答えます。
- ↑ / ↓ で質問を選び、Enter で回答を開いたり畳んだりします。一番新しい質問から ↓ で入力欄に戻ります。
- Esc で閉じます。閉じた後の `/btw 質問` は新しく始まり、前回までの質問は上に 1 行ずつ畳んで並びます。
- 引数なしの `/btw` で、前回の画面を閉じたときのまま開き直します。
- `copy` で選んでいる回答(選んでいなければ最後の回答)をコピー、`clear history` で全部忘れます。
- 画面の幅を Claude に伝え、幅に収まらない表は箇条書きに直して表示します。

覚えておける質問はセッションごとに 20 件までで、`/clear` で消えます。

### 注意

- 入れている間、`/btw` はすべてこの mod の動きになります。mod の読み込みに失敗したときは、組み込みの `/btw` が動きます。
- Claude Code の mod の仕組みは先行公開の段階で、更新で動かなくなる可能性があります。確認済みの版は 2.1.296 です。
- 入れる操作はターミナル版でだけできます。ユーザー全体に入れておけば、デスクトップ版のコード画面でも動きます。
