// This setup uses Hardhat Ignition to manage smart contract deployments.
// Learn more about it at https://hardhat.org/ignition

const { buildModule } = require("@nomicfoundation/hardhat-ignition/modules");

const TELLOR_DATA_BANK_ADDRESS = "0x0000000000000000000000000000000000000000";
const QUERY_ID = "0x0000000000000000000000000000000000000000000000000000000000000000";
const DECIMALS = 18;

module.exports = buildModule("GuardedTellorChainlinkAdapterModule", (m) => {
  const tellorDataBankAddress = m.getParameter("tellorDataBankAddress", TELLOR_DATA_BANK_ADDRESS);
  const queryId = m.getParameter("queryId", QUERY_ID);
  const decimals = m.getParameter("decimals", DECIMALS);

  const guardedTellorChainlinkAdapter = m.contract("GuardedTellorChainlinkAdapter", [tellorDataBankAddress, queryId, decimals]);

  return { guardedTellorChainlinkAdapter };
}); 