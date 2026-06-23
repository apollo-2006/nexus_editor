export interface Char {
  char: string;
  position: number;
  siteId: string;
}

export class CRDT {
  private document: Char[] = [];
  private siteId: string = Math.random().toString(36).substring(7);

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
    this.document.sort((a, b) => a.position - b.position);
    
    return newChar;
  }

  remoteInsert(incomingChar: Char) {
    // If the server sends us a character from another user, just push and sort.
    // Because the positions are fractional, it will mathematically drop into the perfect slot.
    this.document.push(incomingChar);
    this.document.sort((a, b) => a.position - b.position);
  }

  getText(): string {
    return this.document.map(c => c.char).join("");
  }
}
