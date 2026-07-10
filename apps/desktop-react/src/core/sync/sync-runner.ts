export class CoalescingSyncRunner {
  private running: Promise<void> | null = null;
  private requested = false;

  constructor(private readonly runSync: () => Promise<void>) {}

  request(): Promise<void> {
    this.requested = true;
    this.running ??= this.drain();
    return this.running;
  }

  private async drain() {
    try {
      while (this.requested) {
        this.requested = false;
        await this.runSync();
      }
    } finally {
      this.running = null;
      if (this.requested) void this.request();
    }
  }
}
