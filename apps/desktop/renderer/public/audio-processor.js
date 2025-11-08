// Audio worklet processor for capturing microphone audio
class AudioProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.port.onmessage = (e) => {
      if (e.data === 'stop') {
        this.stop();
      }
    };
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    if (input.length > 0) {
      const inputChannel = input[0];
      // Convert float32 to int16
      const int16 = new Int16Array(inputChannel.length);
      for (let i = 0; i < inputChannel.length; i++) {
        int16[i] = Math.max(-32768, Math.min(32767, inputChannel[i] * 32768));
      }
      // Send to main thread
      this.port.postMessage(int16.buffer, [int16.buffer]);
    }
    return true;
  }
}

registerProcessor('audio-processor', AudioProcessor);

