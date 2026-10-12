// Spoken cues with the Web Speech API (built into browsers, works offline).

export class Voice {
  constructor() {
    this.supported = typeof window !== 'undefined' && 'speechSynthesis' in window;
    this.enabled = true;
  }

  /**
   * iOS only lets a page speak after speech was started from a tap.
   * Call this inside a click handler (e.g. "Start set") to unlock it.
   */
  unlock() {
    if (!this.supported) return;
    const silent = new SpeechSynthesisUtterance(' ');
    silent.volume = 0;
    speechSynthesis.speak(silent);
  }

  /**
   * Say something. By default it interrupts whatever is being said, so the
   * user always hears the latest rep instead of a growing backlog.
   */
  say(text, { interrupt = true } = {}) {
    if (!this.supported || !this.enabled || !text) return;
    // Only cancel when something is queued: some Android builds drop the next
    // utterance if cancel() is called while idle.
    if (interrupt && (speechSynthesis.speaking || speechSynthesis.pending)) speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'en-US';
    utterance.rate = 1.08;
    speechSynthesis.speak(utterance);
  }

  stop() {
    if (this.supported) speechSynthesis.cancel();
  }
}
