// This setup uses Hardhat Ignition to manage smart contract deployments.
// Learn more about it at https://hardhat.org/ignition

const { buildModule } = require("@nomicfoundation/hardhat-ignition/modules");

const GUARDIAN_ADDRESS = "0xfE2952AD10262C6b466070CA34dBB7fA54b882e3";

module.exports = buildModule("TellorDataBridgeTestnetModule", (m) => {
  const guardianAddress = m.getParameter("guardianAddress", GUARDIAN_ADDRESS);

  const tellorDataBridgeTestnet = m.contract("TellorDataBridgeTestnet", [guardianAddress]);

  return { tellorDataBridgeTestnet };
}); 