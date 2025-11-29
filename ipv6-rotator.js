import crypto from 'crypto';

/**
 * IPv6 Address Rotator
 * Generates random IPv6 addresses from your OVH /64 block
 * Avoids the roblox-* interface addresses (1-196 in hex = 0x1 to 0xc4)
 */
class IPv6Rotator {
  constructor(prefix = '2607:5300:205:200') {
    this.prefix = prefix;
    this.reservedRanges = [
      { start: 0x1, end: 0xc4 }  // roblox-1 to roblox-196
    ];
  }

  /**
   * Generate a random IPv6 address avoiding reserved ranges
   */
  generateRandomIP() {
    let randomHex;
    let firstSegment;
    
    // Keep generating until we get one outside reserved ranges
    do {
      randomHex = crypto.randomBytes(8).toString('hex');
      // Get first 16 bits to check against reserved ranges
      firstSegment = parseInt(randomHex.substr(0, 4), 16);
    } while (this.isReserved(firstSegment));
    
    // Format as proper IPv6
    const parts = [];
    for (let i = 0; i < randomHex.length; i += 4) {
      parts.push(randomHex.substr(i, 4));
    }
    
    return `${this.prefix}::${parts.join(':')}`;
  }

  /**
   * Check if a segment falls in reserved range
   */
  isReserved(segment) {
    for (const range of this.reservedRanges) {
      if (segment >= range.start && segment <= range.end) {
        return true;
      }
    }
    return false;
  }

  /**
   * Get address for a specific session
   */
  getAddressForSession(sessionId, ttl = 300000) {
    // For now, just generate random - can add session persistence later
    return this.generateRandomIP();
  }
}

export default IPv6Rotator;