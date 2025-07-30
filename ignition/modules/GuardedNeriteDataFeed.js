// This setup uses Hardhat Ignition to manage smart contract deployments.
// Learn more about it at https://hardhat.org/ignition

const { buildModule } = require("@nomicfoundation/hardhat-ignition/modules");

const DATA_BRIDGE_ADDRESS = "0x0000000000000000000000000000000000000000";
const QUERY_ID = "0x0000000000000000000000000000000000000000000000000000000000000000";
const ADMIN_ADDRESS = "0x0000000000000000000000000000000000000000";

module.exports = buildModule("GuardedNeriteDataFeedModule", (m) => {
  const dataBridgeAddress = m.getParameter("dataBridgeAddress", DATA_BRIDGE_ADDRESS);
  const queryId = m.getParameter("queryId", QUERY_ID);
  const adminAddress = m.getParameter("adminAddress", ADMIN_ADDRESS);

  const guardedNeriteDataFeed = m.contract("GuardedNeriteDataFeed", [dataBridgeAddress, queryId, adminAddress]);

  return { guardedNeriteDataFeed };
}); 