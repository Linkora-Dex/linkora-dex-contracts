**Slither** - a static analyzer for Solidity smart contracts, developed by Trail of Bits for automatic 
detection of vulnerabilities and security issues in code. The tool scans contracts for common vulnerability patterns, 
gas issues, standard compliance and potential bugs without the need to deploy contracts to the network.

```bash
slither ./contracts/core --solc-remaps @openzeppelin/=./node_modules/@openzeppelin/ --config-file slither.config.json
```

The command runs analysis of contracts from the project root directory with specifying the path to OpenZeppelin 
dependencies and using a custom configuration file to set up scanning parameters.