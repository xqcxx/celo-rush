// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract SeasonTrophy is ERC721, Ownable {
    address public minter;

    event MinterSet(address indexed minter);

    error NotMinter();

    constructor() ERC721("Celo Rush Season Trophy", "CRST") Ownable(msg.sender) {}

    function setMinter(address _minter) external onlyOwner {
        minter = _minter;
        emit MinterSet(_minter);
    }

    function safeMint(address to, uint256 tokenId) external {
        if (msg.sender != minter) revert NotMinter();
        _safeMint(to, tokenId);
    }
}
