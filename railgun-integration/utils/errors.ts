export class RailgunError extends Error {
  constructor(message: string, public code: string) {
    super(message);
    this.name = "RailgunError";
  }
}

export class EngineError extends RailgunError {
  constructor(message: string) {
    super(message, "ENGINE_ERROR");
  }
}

export class WalletError extends RailgunError {
  constructor(message: string) {
    super(message, "WALLET_ERROR");
  }
}

export class TransactionError extends RailgunError {
  constructor(message: string) {
    super(message, "TRANSACTION_ERROR");
  }
}

export class ProofGenerationError extends RailgunError {
  constructor(message: string) {
    super(message, "PROOF_ERROR");
  }
}

export class BroadcasterError extends RailgunError {
  constructor(message: string) {
    super(message, "BROADCASTER_ERROR");
  }
}

export class GasEstimationError extends RailgunError {
  constructor(message: string) {
    super(message, "GAS_ESTIMATION_ERROR");
  }
}
