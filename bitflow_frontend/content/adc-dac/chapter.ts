import { p, ul } from "@/lib/academy/draw";
import type { AcademyTopic } from "@/lib/academy-types";

const chapter: AcademyTopic = {
  slug: "adc-dac",
  title: "ADC and DAC: Meeting the Analog World",
  summary: "How digital systems measure and produce real voltages: sampling, aliasing, quantization, and the main converter designs.",
  icon: "∿",
  difficulty: "core",
  order: 19,
  estimatedMinutes: 35,
  prerequisites: ["what-is-digital", "number-systems"],
  sections: [
    {
      id: "why",
      heading: "Two steps from analog to digital",
      blocks: [
        p("Sound, temperature and light are all analog, and a processor can only work with numbers. An **analog-to-digital converter** (ADC) measures a voltage and produces a number. A **digital-to-analog converter** (DAC) does the reverse. Going from analog to digital takes two separate steps, and each loses something in its own way."),
        ul("**Sampling** chops time into instants. It decides how fast a signal you can capture.", "**Quantization** rounds each sample to a code. It decides how finely you can measure."),
      ],
    },
    {
      id: "sampling",
      heading: "Sampling and the Nyquist limit",
      blocks: [
        p("How often do you need to measure? The **Nyquist-Shannon sampling theorem** gives the answer: to capture a signal fully, sample at more than twice its highest frequency. If you don't, high frequencies pretend to be low ones, and this is called **aliasing**."),
        { kind: "formula", text: "f_s > 2 × f_max", note: "Half the sampling rate is called the Nyquist frequency." },
        { kind: "anim", id: "sampling" },
        { kind: "callout", tone: "tip", text: "You've seen aliasing in films, when a turning wheel appears to spin backwards. The camera is sampling too slowly." },
        p("Once aliased, a signal can't be fixed, so the unwanted frequencies have to be removed **before** sampling. That's the job of an analog **anti-aliasing filter**. CD audio samples at 44.1 kHz so that it can capture sound up to about 20 kHz, with room left for the filter."),
        { kind: "formula", text: "f_alias = | f − f_s × round(f / f_s) |" },
        { kind: "practice", question: "A 7 kHz tone is sampled at 10 kHz. What frequency does it appear to be?", options: ["3 kHz", "5 kHz", "7 kHz", "17 kHz"], correctIndex: 0, explanation: "|7 − 10 × round(0.7)| = |7 − 10| = **3 kHz**." },
      ],
    },
    {
      id: "quantization",
      heading: "Quantization",
      blocks: [
        p("An n-bit ADC has 2ⁿ codes. The voltage between neighbouring codes is called the **LSB**, or the converter's **resolution**."),
        { kind: "formula", text: "1 LSB = V_ref / 2ⁿ", note: "An 8-bit converter on a 5 V range has an LSB of about 19.5 mV." },
        { kind: "anim", id: "quantize" },
        { kind: "formula", text: "SNR ≈ 6.02 n + 1.76 dB", note: "The best possible signal-to-noise ratio of an ideal n-bit converter, for a full-scale sine wave." },
        { kind: "example", title: "Reading a code", problem: "A 10-bit ADC with a 3.3 V reference reads 512. What's the input voltage?", steps: ["1 LSB = 3.3 / 1024 = 3.22 mV.", "512 × 3.22 mV = 1.65 V."], answer: "About **1.65 V**, halfway up the range, as you'd expect from a code halfway up." },
        { kind: "practice", question: "What's the resolution of a 12-bit ADC with a 4.096 V reference?", options: ["1 mV", "2 mV", "4 mV", "12 mV"], correctIndex: 0, explanation: "4.096 V / 4096 = **1 mV**." },
      ],
    },
    {
      id: "dac",
      heading: "DACs",
      blocks: [
        p("A DAC is the simpler direction: each bit contributes a share of the reference voltage in proportion to its weight, and they're all added."),
        { kind: "formula", text: "V_out = V_ref × code / 2ⁿ" },
        { kind: "anim", id: "dac-bits" },
        { kind: "table", headers: ["Type", "How it works", "Trade-off"], rows: [["Binary-weighted", "One resistor per bit, each double the last", "Simple, but needs a very wide range of precise resistors"], ["R-2R ladder", "A network of only two resistor values", "Easy to make accurately, the most common"], ["PWM", "A digital pulse train, filtered", "Very cheap, but slow; used by microcontrollers"]] },
        { kind: "link", href: "/lab", label: "Try PWM in the Board Lab", text: "A lesson dims an LED by switching it fast, which is a DAC made from one pin." },
      ],
    },
    {
      id: "adc",
      heading: "ADC designs",
      blocks: [
        p("Measuring is harder than producing, and each design makes a different trade between speed, resolution and cost. The most common is **successive approximation**, which is a binary search with a DAC inside."),
        { kind: "anim", id: "sar-adc" },
        { kind: "table", headers: ["Type", "Conversion time", "Typical use"], rows: [["Flash", "1 clock, using 2ⁿ − 1 comparators", "Very fast, such as oscilloscopes; costly in power and area"], ["SAR", "n clocks, 1 comparator", "Microcontrollers; a good all-rounder"], ["Dual-slope", "Up to 2ⁿ⁺¹ clocks", "Digital multimeters: slow, accurate, rejects noise"], ["Sigma-delta", "Many clocks, oversampled", "Audio and precise sensors"]] },
        { kind: "practice", question: "How many comparators does an 8-bit flash ADC need?", options: ["8", "16", "255", "256"], correctIndex: 2, explanation: "2⁸ − 1 = **255**, one for each boundary between codes." },
        { kind: "practice", question: "A SAR ADC has 10 bits and runs at 1 MHz. How long is one conversion?", options: ["1 µs", "10 µs", "100 µs", "1 ms"], correctIndex: 1, explanation: "One clock per bit: 10 × 1 µs = **10 µs**." },
      ],
    },
    {
      id: "gate-converters",
      heading: "Exam problems",
      level: "gate",
      blocks: [
        p("Beyond resolution, datasheets quote **offset error** (a constant shift), **gain error** (a wrong slope), and **linearity**: how far each step differs from one LSB. A converter is **monotonic** if its output never falls as the code rises."),
        { kind: "practice", gate: true, question: "What is the output of a 4-bit DAC with V_ref = 8 V for code 1010?", options: ["2 V", "4 V", "5 V", "10 V"], correctIndex: 2, explanation: "8 × 10 / 16 = **5 V**." },
        { kind: "practice", gate: true, question: "What SNR can an ideal 16-bit converter reach?", options: ["48 dB", "74 dB", "98 dB", "120 dB"], correctIndex: 2, explanation: "6.02 × 16 + 1.76 ≈ **98 dB**." },
        { kind: "practice", gate: true, question: "How many bits must an ADC have to resolve 1 mV on a 5 V range?", options: ["10", "11", "12", "13"], correctIndex: 3, explanation: "5 V / 1 mV = 5000 levels. 2¹² = 4096 is too few, and 2¹³ = 8192 is enough: **13**." },
        { kind: "practice", gate: true, question: "What's the minimum sampling rate for a signal with components up to 15 kHz?", options: ["7.5 kHz", "15 kHz", "Just over 30 kHz", "60 kHz"], correctIndex: 2, explanation: "More than twice the highest frequency: **just over 30 kHz**." },
      ],
    },
  ],
  quiz: [
    { id: "q1", question: "What does an ADC do?", options: ["Turns a voltage into a number", "Turns a number into a voltage", "Adds two numbers", "Stores a sample"], correctIndex: 0, explanation: "Analog to digital." },
    { id: "q2", question: "What sampling rate does a 4 kHz signal need?", options: ["More than 2 kHz", "More than 4 kHz", "More than 8 kHz", "More than 16 kHz"], correctIndex: 2, explanation: "More than twice the highest frequency." },
    { id: "q3", question: "What's aliasing?", options: ["High frequencies appearing as low ones after sampling", "Rounding error", "A noisy supply", "A code changing twice"], correctIndex: 0, explanation: "Samples can't distinguish a fast signal from its slower alias." },
    { id: "q4", question: "Where does an anti-aliasing filter go?", options: ["Before the ADC", "After the ADC", "In the processor", "After the DAC"], correctIndex: 0, explanation: "After sampling, the alias can't be told apart from a real signal." },
    { id: "q5", question: "What's the LSB of an 8-bit converter with a 2.56 V range?", options: ["1 mV", "10 mV", "100 mV", "1 V"], correctIndex: 1, explanation: "2.56 / 256 = 10 mV." },
    { id: "q6", question: "What does one more bit of resolution do?", options: ["Halves the quantization error", "Doubles the sampling rate", "Halves the sampling rate", "Doubles the error"], correctIndex: 0, explanation: "And it adds about 6 dB of SNR." },
    { id: "q7", question: "What is the output of an n-bit DAC?", options: ["V_ref × code / 2ⁿ", "V_ref × 2ⁿ / code", "code / V_ref", "V_ref × code"], correctIndex: 0, explanation: "Each code is one more LSB." },
    { id: "q8", question: "Why is the R-2R ladder popular?", options: ["It needs only two resistor values", "It needs no resistors", "It's digital", "It has no reference"], correctIndex: 0, explanation: "Matching two values is much easier than making many precise ones." },
    { id: "q9", question: "Which ADC is fastest?", options: ["Flash", "SAR", "Dual-slope", "Sigma-delta"], correctIndex: 0, explanation: "All its comparators decide in parallel, in one clock." },
    { id: "q10", question: "How many clocks does an n-bit SAR ADC take?", options: ["1", "n", "2ⁿ", "2ⁿ − 1"], correctIndex: 1, explanation: "It finds one bit per comparison." },
  ],
  flashcards: [
    { id: "f1", front: "Nyquist rate", back: "Sample at more than twice the highest frequency." },
    { id: "f2", front: "Aliasing", back: "Frequencies above half the sampling rate fold down to lower ones." },
    { id: "f3", front: "Anti-aliasing filter", back: "An analog low-pass filter placed before the ADC." },
    { id: "f4", front: "1 LSB", back: "V_ref / 2ⁿ" },
    { id: "f5", front: "Ideal SNR", back: "6.02n + 1.76 dB" },
    { id: "f6", front: "DAC output", back: "V_ref × code / 2ⁿ" },
    { id: "f7", front: "R-2R ladder", back: "A DAC using only two resistor values." },
    { id: "f8", front: "Flash ADC", back: "2ⁿ − 1 comparators, one clock, very fast, power-hungry." },
    { id: "f9", front: "SAR ADC", back: "A binary search with a DAC: n clocks, one comparator." },
    { id: "f10", front: "Dual-slope ADC", back: "Slow, but accurate and good at rejecting noise." },
  ],
  videos: [],
};

export default chapter;
