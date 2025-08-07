// This setup uses Hardhat Ignition to manage smart contract deployments.
// Learn more about it at https://hardhat.org/ignition

const { buildModule } = require("@nomicfoundation/hardhat-ignition/modules");

const DATA_BANK_ADDRESS = "0x0000000000000000000000000000000000000000";
const QUERY_ID = "0x0000000000000000000000000000000000000000000000000000000000000000";
const DECIMALS = 18;
const PROJECT_NAME = "ProjectA";
const FEED_NAME = "ETH/USD";
const ADMIN_ADDRESS = "0x0000000000000000000000000000000000000000";

module.exports = buildModule("GuardedLiquityV2OracleAdaptorModule", (m) => {
  const dataBankAddress = m.getParameter("dataBankAddress", DATA_BANK_ADDRESS);
  const queryId = m.getParameter("queryId", QUERY_ID);
  const decimals = m.getParameter("decimals", DECIMALS);
  const projectName = m.getParameter("projectName", PROJECT_NAME);
  const feedName = m.getParameter("feedName", FEED_NAME);
  const adminAddress = m.getParameter("adminAddress", ADMIN_ADDRESS);

  const guardedLiquityV2OracleAdaptor = m.contract("GuardedLiquityV2OracleAdaptor", [
    dataBankAddress,
    queryId,
    decimals,
    projectName,
    feedName,
    adminAddress
  ]);

  return { guardedLiquityV2OracleAdaptor };
}); 