// This setup uses Hardhat Ignition to manage smart contract deployments.
// Learn more about it at https://hardhat.org/ignition

const { buildModule } = require("@nomicfoundation/hardhat-ignition/modules");

const DATA_BANK_ADDRESS = "0x0000000000000000000000000000000000000000";
const QUERY_ID = "0x0000000000000000000000000000000000000000000000000000000000000000";
const DECIMALS = 18;
const FEED_NAME = "ETH/USD";
const ADMIN_ADDRESS = "0x0000000000000000000000000000000000000000";

module.exports = buildModule("GuardedNeriteOracleAdaptorModule", (m) => {
  const dataBankAddress = m.getParameter("dataBankAddress", DATA_BANK_ADDRESS);
  const queryId = m.getParameter("queryId", QUERY_ID);
  const decimals = m.getParameter("decimals", DECIMALS);
  const feedName = m.getParameter("feedName", FEED_NAME);
  const adminAddress = m.getParameter("adminAddress", ADMIN_ADDRESS);

  const guardedNeriteOracleAdaptor = m.contract("GuardedNeriteOracleAdaptor", [
    dataBankAddress,
    queryId,
    decimals,
    feedName,
    adminAddress
  ]);

  return { guardedNeriteOracleAdaptor };
}); 