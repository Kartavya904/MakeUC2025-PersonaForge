class PCM16Writer extends AudioWorkletProcessor {
  process(inputs) {
    const input = inputs[0]?.[0];
    if (!input) return true;

    const pcm = new Int16Array(input.length);
    for (let i = 0; i < input.length; i++) {
      let s = input[i];
      s = Math.max(-1, Math.min(1, s));
      pcm[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }

    this.port.postMessage({ type: "pcm-chunk", buffer: pcm.buffer }, [pcm.buffer]);
    return true;
  }
}
registerProcessor("pcm16-writer", PCM16Writer);
