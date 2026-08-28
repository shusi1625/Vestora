// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract ReceivableMarketplace is ReentrancyGuard {
    using SafeERC20 for IERC20;

    IERC721 public immutable receivableNft;
    IERC20 public immutable paymentToken;

    struct Listing {
        address seller;
        uint256 price;
    }

    mapping(uint256 => Listing) private _listings;

    event Listed(
        uint256 indexed streamId,
        address indexed seller,
        uint256 price
    );

    event ListingCanceled(
        uint256 indexed streamId,
        address indexed seller
    );

    event Purchased(
        uint256 indexed streamId,
        address indexed seller,
        address indexed buyer,
        uint256 price
    );

    constructor(address receivableNft_, address paymentToken_) {
        require(receivableNft_ != address(0), "invalid NFT");
        require(paymentToken_ != address(0), "invalid payment token");

        receivableNft = IERC721(receivableNft_);
        paymentToken = IERC20(paymentToken_);
    }

    function list(uint256 streamId, uint256 price) external {
        require(price > 0, "invalid price");
        require(receivableNft.ownerOf(streamId) == msg.sender, "not NFT owner");
        require(_listings[streamId].seller == address(0), "already listed");

        address approved = receivableNft.getApproved(streamId);
        bool approvedForAll = receivableNft.isApprovedForAll(
            msg.sender,
            address(this)
        );

        require(
            approved == address(this) || approvedForAll,
            "marketplace not approved"
        );

        _listings[streamId] = Listing({
            seller: msg.sender,
            price: price
        });

        emit Listed(streamId, msg.sender, price);
    }

    function cancelListing(uint256 streamId) external {
        Listing memory listing = _listings[streamId];

        require(listing.seller != address(0), "not listed");
        require(listing.seller == msg.sender, "not seller");

        delete _listings[streamId];

        emit ListingCanceled(streamId, msg.sender);
    }

    function getListing(uint256 streamId) external view returns (Listing memory) {
        return _listings[streamId];
    }

    function buy(uint256 streamId) external nonReentrant {
        Listing memory listing = _listings[streamId];

        require(listing.seller != address(0), "not listed");
        require(
            receivableNft.ownerOf(streamId) == listing.seller,
            "seller no longer owns NFT"
        );

        delete _listings[streamId];

        paymentToken.safeTransferFrom(
            msg.sender,
            listing.seller,
            listing.price
        );

        receivableNft.safeTransferFrom(
            listing.seller,
            msg.sender,
            streamId
        );

        emit Purchased(
            streamId,
            listing.seller,
            msg.sender,
            listing.price
        );
    }
}