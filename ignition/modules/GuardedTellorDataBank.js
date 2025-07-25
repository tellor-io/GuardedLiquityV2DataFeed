// This setup uses Hardhat Ignition to manage smart contract deployments.
// Learn more about it at https://hardhat.org/ignition

const { buildModule } = require("@nomicfoundation/hardhat-ignition/modules");

const DATA_BRIDGE_ADDRESS = "0x0000000000000000000000000000000000000000";
const GUARDIAN_ADDRESS = "0x0000000000000000000000000000000000000000";

module.exports = buildModule("GuardedTellorDataBankModule", (m) => {
  const dataBridgeAddress = m.getParameter("dataBridgeAddress", DATA_BRIDGE_ADDRESS);
  const guardianAddress = m.getParameter("guardianAddress", GUARDIAN_ADDRESS);

  const guardedTellorDataBank = m.contract("GuardedTellorDataBank", [dataBridgeAddress, guardianAddress]);

  return { guardedTellorDataBank };
}); 