// This setup uses Hardhat Ignition to manage smart contract deployments.
// Learn more about it at https://hardhat.org/ignition

const { buildModule } = require("@nomicfoundation/hardhat-ignition/modules");

const DATA_BRIDGE_ADDRESS = "0x0000000000000000000000000000000000000000";

module.exports = buildModule("TellorDataBankModule", (m) => {
  const dataBridgeAddress = m.getParameter("dataBridgeAddress", DATA_BRIDGE_ADDRESS);

  const tellorDataBank = m.contract("TellorDataBank", [dataBridgeAddress]);

  return { tellorDataBank };
}); 