/**
 * Abstract frequency statistics for EUC-based encodings.
 * Used by the sampler to score which encoding best matches sampled byte data.
 */
export abstract class nsEUCStatistics {
  abstract mFirstByteFreq(): number[];
  abstract mFirstByteStdDev(): number;
  abstract mFirstByteMean(): number;
  abstract mFirstByteWeight(): number;
  abstract mSecondByteFreq(): number[];
  abstract mSecondByteStdDev(): number;
  abstract mSecondByteMean(): number;
  abstract mSecondByteWeight(): number;
}
