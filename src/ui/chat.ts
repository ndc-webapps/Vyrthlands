/**
 * In-game chat: message feed (bottom-left, fades out) + input line.
 * Works solo (commands, system lines) and in servers (broadcast).
 */
export class Chat {
  private box = document.getElementById('chat-box')!;
  private feed = document.getElementById('chat-messages')!;
  private input = document.getElementById('chat-input') as HTMLInputElement;
  private open_ = false;

  /** Called with the raw input line when the player presses Enter. */
  onSend: ((text: string) => void) | null = null;
  onClose: (() => void) | null = null;

  constructor() {
    this.input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') {
        const text = this.input.value.trim();
        this.input.value = '';
        if (text) this.onSend?.(text);
        this.close();
      } else if (e.key === 'Escape') {
        this.input.value = '';
        this.close();
      }
    });
    // don't let game keybinds fire while typing
    this.input.addEventListener('keyup', (e) => e.stopPropagation());
  }

  get isOpen(): boolean { return this.open_; }

  show(): void { this.box.classList.remove('hidden'); }
  hide(): void { this.box.classList.add('hidden'); this.close(); }

  openInput(): void {
    this.open_ = true;
    this.input.classList.remove('hidden');
    this.feed.classList.add('chat-focus');
    // focus after the keydown that opened us has finished
    setTimeout(() => this.input.focus(), 0);
  }

  close(): void {
    this.open_ = false;
    this.input.classList.add('hidden');
    this.feed.classList.remove('chat-focus');
    this.input.blur();
    this.onClose?.();
  }

  /** Player or system line. System lines render gold. */
  add(from: string | null, text: string): void {
    const line = document.createElement('div');
    line.className = 'chat-line' + (from === null ? ' chat-system' : '');
    if (from !== null) {
      const name = document.createElement('b');
      name.textContent = `<${from}> `;
      line.appendChild(name);
    }
    line.appendChild(document.createTextNode(text));
    this.feed.appendChild(line);
    while (this.feed.children.length > 8) this.feed.firstChild!.remove();
    // fade old lines away unless the input is open
    window.setTimeout(() => line.classList.add('chat-old'), 6000);
    this.feed.scrollTop = this.feed.scrollHeight;
  }
}
