// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface IReceivableStream is IERC721 {
    struct Stream {
        address sender;
        address token;
        uint256 depositedAmount;
        uint64 startTime;
        uint64 endTime;
        uint256 withdrawnAmount;
        bool cancelable;
        bool canceled;
        uint64 canceledAt;
    }

    function getStream(uint256 streamId) external view returns (Stream memory);
    function vestedAmount(uint256 streamId) external view returns (uint256);
}

contract ReceivableMarketplace is ReentrancyGuard {
    using SafeERC20 for IERC20;

    error InvalidReceivableNft();
    error InvalidPaymentToken();
    error InvalidPrice();
    error InvalidExpectedSeller();
    error NotNftOwner();
    error AlreadyListed();
    error MarketplaceNotApproved();
    error NotListed();
    error NotSeller();
    error PriceExceedsMaximum();
    error UnexpectedSeller();
    error SellerNoLongerOwnsNft();
    error WithdrawnExceedsMaximum();
    error RemainingBelowMinimum();

    IReceivableStream public immutable receivableNft;
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
        if (receivableNft_ == address(0)) {
            revert InvalidReceivableNft();
        }
        if (paymentToken_ == address(0)) {
            revert InvalidPaymentToken();
        }

        receivableNft = IReceivableStream(receivableNft_);
        paymentToken = IERC20(paymentToken_);
    }

    function list(uint256 streamId, uint256 price) external {
        if (price == 0) {
            revert InvalidPrice();
        }
        if (receivableNft.ownerOf(streamId) != msg.sender) {
            revert NotNftOwner();
        }
        if (_listings[streamId].seller != address(0)) {
            revert AlreadyListed();
        }

        address approved = receivableNft.getApproved(streamId);
        if (
            approved != address(this)
                && !receivableNft.isApprovedForAll(msg.sender, address(this))
        ) {
            revert MarketplaceNotApproved();
        }

        _listings[streamId] = Listing({
            seller: msg.sender,
            price: price
        });

        emit Listed(streamId, msg.sender, price);
    }

    function cancelListing(uint256 streamId) external {
        Listing memory listing = _listings[streamId];

        if (listing.seller == address(0)) {
            revert NotListed();
        }
        if (listing.seller != msg.sender) {
            revert NotSeller();
        }

        delete _listings[streamId];

        emit ListingCanceled(streamId, msg.sender);
    }

    function getListing(uint256 streamId) external view returns (Listing memory) {
        return _listings[streamId];
    }

    function buy(uint256 streamId) external nonReentrant {
        Listing memory listing = _requireActiveListing(streamId);
        _requireSellerOwnership(streamId, listing.seller);
        _settlePurchase(streamId, listing);
    }

    function buyWithProtection(
        uint256 streamId,
        uint256 maxPrice,
        uint256 minRemainingReceivable,
        uint256 maxWithdrawnAmount,
        address expectedSeller
    ) external nonReentrant {
        if (expectedSeller == address(0)) {
            revert InvalidExpectedSeller();
        }

        Listing memory listing = _requireActiveListing(streamId);

        if (listing.price > maxPrice) {
            revert PriceExceedsMaximum();
        }
        if (listing.seller != expectedSeller) {
            revert UnexpectedSeller();
        }

        _requireSellerOwnership(streamId, listing.seller);

        IReceivableStream.Stream memory stream = receivableNft.getStream(
            streamId
        );

        if (stream.withdrawnAmount > maxWithdrawnAmount) {
            revert WithdrawnExceedsMaximum();
        }

        if (_remainingReceivable(streamId, stream) < minRemainingReceivable) {
            revert RemainingBelowMinimum();
        }

        _settlePurchase(streamId, listing);
    }

    function _requireActiveListing(
        uint256 streamId
    ) private view returns (Listing memory listing) {
        listing = _listings[streamId];

        if (listing.seller == address(0)) {
            revert NotListed();
        }
    }

    function _requireSellerOwnership(
        uint256 streamId,
        address seller
    ) private view {
        if (receivableNft.ownerOf(streamId) != seller) {
            revert SellerNoLongerOwnsNft();
        }
    }

    function _settlePurchase(
        uint256 streamId,
        Listing memory listing
    ) private {
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

    function _remainingReceivable(
        uint256 streamId,
        IReceivableStream.Stream memory stream
    ) private view returns (uint256) {
        uint256 settlementCeiling = stream.canceled
            ? receivableNft.vestedAmount(streamId)
            : stream.depositedAmount;

        if (settlementCeiling <= stream.withdrawnAmount) {
            return 0;
        }

        return settlementCeiling - stream.withdrawnAmount;
    }
}
