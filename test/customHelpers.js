const h = require("usingtellorlayer/src/helpers/evmHelpers.js");

/**
 * Enhanced prepareOracleData function that allows overriding any parameter
 * @param {string} queryId - The query ID for the oracle data
 * @param {string} value - The encoded value to be reported
 * @param {Array} validators - Array of validator objects with address and privateKey
 * @param {Array} powers - Array of validator powers
 * @param {string} validatorCheckpoint - The validator checkpoint hash
 * @param {Object} overrides - Optional overrides for any calculated values
 * @param {number} overrides.aggregateTimestamp - Custom aggregate timestamp (default: (block.timestamp - 2) * 1000)
 * @param {number} overrides.aggregatePower - Custom aggregate power (default: sum of powers)
 * @param {number} overrides.attestationTimestamp - Custom attestation timestamp (default: aggregateTimestamp + 1000)
 * @param {number} overrides.previousTimestamp - Custom previous timestamp (default: 0)
 * @param {number} overrides.nextTimestamp - Custom next timestamp (default: 0)
 * @param {number} overrides.lastConsensusTimestamp - Custom last consensus timestamp (default: aggregateTimestamp for consensus data)
 * @param {boolean} overrides.ignoreInvariantChecks - Whether to skip invariant checks (default: false)
 * @returns {Object} Object containing attestData, currentValidatorSet, and sigs
 */

async function prepareOracleData(queryId, value, validators, powers, validatorCheckpoint, overrides = {}) {
  const blocky = await h.getBlock();
  
  // Calculate defaults
  const defaultAggregateTimestamp = (blocky.timestamp - 2) * 1000;
  const defaultAggregatePower = powers.reduce((a, b) => a + b, 0);
  
  // Use overrides or defaults
  const aggregateTimestamp = overrides.aggregateTimestamp !== undefined ? overrides.aggregateTimestamp : defaultAggregateTimestamp;
  const aggregatePower = overrides.aggregatePower !== undefined ? overrides.aggregatePower : defaultAggregatePower;
  const attestationTimestamp = overrides.attestationTimestamp !== undefined ? overrides.attestationTimestamp : aggregateTimestamp + 1000;
  const previousTimestamp = overrides.previousTimestamp !== undefined ? overrides.previousTimestamp : 0;
  const nextTimestamp = overrides.nextTimestamp !== undefined ? overrides.nextTimestamp : 0;
  // Default to consensus data (aggregateTimestamp == lastConsensusTimestamp)
  const lastConsensusTimestamp = overrides.lastConsensusTimestamp !== undefined ? overrides.lastConsensusTimestamp : aggregateTimestamp;
  
  // Validate invariants if not overridden. These are not checked by the contract. But they are expected behavior,
  // and help when writing tests. They can be ignored if testing for invariant violations.
  if (!overrides.ignoreInvariantChecks) {
    if (previousTimestamp > 0 && aggregateTimestamp <= previousTimestamp) {
        throw new Error("Invariant violation: aggregateTimestamp must be > previousTimestamp");
    }
    if (nextTimestamp > 0 && nextTimestamp <= aggregateTimestamp) {
        throw new Error("Invariant violation: nextTimestamp must be > aggregateTimestamp or 0");
    }
    if (attestationTimestamp < aggregateTimestamp) {
        throw new Error("Invariant violation: attestationTimestamp must be >= aggregateTimestamp");
    }
    if (attestationTimestamp < lastConsensusTimestamp) {
        throw new Error("Invariant violation: attestationTimestamp must be >= lastConsensusTimestamp");
    }
  }
  
  // Generate data digest
  const dataDigest = await h.getDataDigest(
    queryId,
    value,
    aggregateTimestamp,
    aggregatePower,
    previousTimestamp,
    nextTimestamp,
    validatorCheckpoint,
    attestationTimestamp,
    lastConsensusTimestamp
  );
  
  // Prepare validator set
  const valAddrs = validators.map(v => v.address);
  const currentValSetArray = await h.getValSetStructArray(valAddrs, powers);
  
  // Generate signatures
  const sigs = [];
  for (let i = 0; i < validators.length; i++) {
    sigs.push(h.layerSign(dataDigest, validators[i].privateKey));
  }
  const sigStructArray = await h.getSigStructArray(sigs);
  
  // Create oracle data struct
  const oracleDataStruct = await h.getOracleDataStruct(
    queryId,
    value,
    aggregateTimestamp,
    aggregatePower,
    previousTimestamp,
    nextTimestamp,
    attestationTimestamp,
    lastConsensusTimestamp
  );
  
  return {
    attestData: oracleDataStruct,
    currentValidatorSet: currentValSetArray,
    sigs: sigStructArray
  };
}

/**
 * Helper function to create oracle data that's too old (for testing data age validation)
 * @param {string} queryId - The query ID
 * @param {string} value - The encoded value
 * @param {Array} validators - Array of validators
 * @param {Array} powers - Array of powers
 * @param {string} validatorCheckpoint - Validator checkpoint
 * @param {number} hoursOld - How many hours old the aggregate data should be (default: 25 hours)
 * @returns {Object} Oracle data that's too old
 */
async function prepareOldOracleData(queryId, value, validators, powers, validatorCheckpoint, hoursOld = 25) {
  const blocky = await h.getBlock();
  const oldAggregateTimestamp = (blocky.timestamp - (hoursOld * 3600)) * 1000; // Convert hours to milliseconds
  
  return prepareOracleData(queryId, value, validators, powers, validatorCheckpoint, {
    aggregateTimestamp: oldAggregateTimestamp,
    lastConsensusTimestamp: oldAggregateTimestamp, // Consensus data
    attestationTimestamp: oldAggregateTimestamp + 1000 // Slightly after aggregate
  });
}

/**
 * Helper function to create oracle data with old attestation (for testing attestation age validation)
 * @param {string} queryId - The query ID
 * @param {string} value - The encoded value
 * @param {Array} validators - Array of validators
 * @param {Array} powers - Array of powers
 * @param {string} validatorCheckpoint - Validator checkpoint
 * @param {number} minutesOld - How many minutes old the attestation should be (default: 15 minutes)
 * @returns {Object} Oracle data with old attestation
 */
async function prepareOldAttestationData(queryId, value, validators, powers, validatorCheckpoint, minutesOld = 15) {
  const blocky = await h.getBlock();
  const oldAttestationTimestamp = (blocky.timestamp - (minutesOld * 60)) * 1000; // Convert minutes to milliseconds
  
  // Since attestationTimestamp must be >= aggregateTimestamp, we need to make the aggregate timestamp even older
  const oldAggregateTimestamp = oldAttestationTimestamp - 1000;
  
  return prepareOracleData(queryId, value, validators, powers, validatorCheckpoint, {
    aggregateTimestamp: oldAggregateTimestamp,
    attestationTimestamp: oldAttestationTimestamp,
    lastConsensusTimestamp: oldAggregateTimestamp // Consensus data
  });
}

/**
 * Helper function to create oracle data with specific aggregate timestamp (useful for testing monotonic ordering)
 * @param {string} queryId - The query ID
 * @param {string} value - The encoded value
 * @param {Array} validators - Array of validators
 * @param {Array} powers - Array of powers
 * @param {string} validatorCheckpoint - Validator checkpoint
 * @param {number} customAggregateTimestamp - The specific aggregate timestamp to use
 * @returns {Object} Oracle data with custom aggregate timestamp
 */
async function prepareOracleDataWithTimestamp(queryId, value, validators, powers, validatorCheckpoint, customAggregateTimestamp) {
  return prepareOracleData(queryId, value, validators, powers, validatorCheckpoint, {
    aggregateTimestamp: customAggregateTimestamp,
    lastConsensusTimestamp: customAggregateTimestamp, // Consensus data
    attestationTimestamp: customAggregateTimestamp + 1000
  });
}

function attestDataStructToArray(attestData) {
  return [
    attestData.queryId,
    [
      attestData.report.value,
      attestData.report.timestamp,
      attestData.report.aggregatePower,
      attestData.report.previousTimestamp,
      attestData.report.nextTimestamp,
      attestData.report.lastConsensusTimestamp,
    ],
    attestData.attestationTimestamp,
  ];
}

// Re-export all the original helpers for convenience
module.exports = {
  ...h, // Export all original helpers
  prepareOracleData, // Our enhanced version
  prepareOldOracleData,
  prepareOldAttestationData,
  prepareOracleDataWithTimestamp,
  attestDataStructToArray,
}; 