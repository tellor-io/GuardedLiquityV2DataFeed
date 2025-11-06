// This setup uses Hardhat Ignition to manage smart contract deployments.
// Learn more about it at https://hardhat.org/ignition

const { buildModule } = require("@nomicfoundation/hardhat-ignition/modules");

const GUARDIAN_ADDRESS = " ";

module.exports = buildModule("TellorDataBridgeModule", (m) => {
  const guardianAddress = m.getParameter("guardianAddress", GUARDIAN_ADDRESS);

  const tellorDataBridge = m.contract("TellorDataBridge", [guardianAddress]);

  return { tellorDataBridge };
}); 