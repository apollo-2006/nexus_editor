export interface Char {
  char: string;
  position: number;
  siteId: string;
}

export class CRDT {
  private document: Char[] = [];
  private siteId: string = Math.random().toString(36).substring(7);

  // Total order over characters.
  //
  // Position alone is not enough. Two users typing into the same gap at the
  // same time generate the *same* fractional position, and Array.sort is only
  // stable with respect to the array it is given -- which is in arrival order,
  // and arrival order differs per machine. The two documents would then sort
  // the tie differently and diverge permanently, which is exactly what a CRDT
  // is supposed to make impossible.
  //
  // Breaking the tie on siteId gives every character a globally unique key that
  // every replica agrees on, so the merge is deterministic.
  private static compare(a: Char, b: Char): number {
    if (a.position !== b.position) return a.position - b.position;
    return a.siteId < b.siteId ? -1 : a.siteId > b.siteId ? 1 : 0;
  }

  // Generate a fractional index exactly between two existing characters
  generatePositionBetween(prevPos: number, nextPos: number): number {
    return prevPos + (nextPos - prevPos) / 2.0;
  }

  localInsert(index: number, char: string): Char {
    const prevPos = index > 0 ? this.document[index - 1].position : 0;
    const nextPos = index < this.document.length ? this.document[index].position : prevPos + 1;
    
    const newPos = this.generatePositionBetween(prevPos, nextPos);
    
    const newChar: Char = { char, position: newPos, siteId: this.siteId };
    
    // Insert into local array and keep it sorted
    this.document.push(newChar);
    this.document.sort(CRDT.compare);

    return newChar;
  }

  remoteInsert(incomingChar: Char) {
    // If the server sends us a character from another user, push and re-sort.
    // Because the positions are fractional, it drops into the right slot without
    // any transformation of the surrounding characters.
    //
    // Applying the same character twice would duplicate it, so ignore anything
    // already held under the same (position, siteId) key. That makes the
    // operation idempotent, and therefore safe to replay on reconnect.
    const exists = this.document.some(
      c => c.position === incomingChar.position && c.siteId === incomingChar.siteId
    );
    if (exists) return;

    this.document.push(incomingChar);
    this.document.sort(CRDT.compare);
  }

  getText(): string {
    return this.document.map(c => c.char).join("");
  }
}
