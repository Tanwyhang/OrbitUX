// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title BatchExecutor
 * @notice EIP-7702 delegate contract for gasless token approvals
 * 
 * This contract is used as a delegation target for EOAs via EIP-7702.
 * When a user signs an authorization to this contract, their EOA can
 * execute batched operations (like approve + transfer) in a single
 * transaction paid for by a relayer.
 * 
 * Security: Only the relayer can call execute() to prevent unauthorized
 * operations on the user's behalf.
 */
contract BatchExecutor {
    // Authorized relayer address
    address public immutable relayer;
    
    // Nonce for replay protection
    mapping(address => uint256) public nonces;
    
    // EIP-712 domain separator
    bytes32 public immutable DOMAIN_SEPARATOR;
    
    // EIP-712 typehash for execute
    bytes32 public constant EXECUTE_TYPEHASH = keccak256(
        "Execute(address token,address spender,uint256 amount,uint256 nonce,uint256 deadline)"
    );
    
    error Unauthorized();
    error ExpiredDeadline();
    error InvalidSignature();
    
    constructor(address _relayer) {
        relayer = _relayer;
        
        DOMAIN_SEPARATOR = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256("BatchExecutor"),
                keccak256("1"),
                block.chainid,
                address(this)
            )
        );
    }
    
    /**
     * @notice Execute an approval on behalf of the delegating EOA
     * @dev This function is called BY the relayer, but executes IN the context
     *      of the EOA that delegated to this contract via EIP-7702.
     *      
     *      When called via delegation:
     *      - address(this) = the EOA's address
     *      - msg.sender = relayer
     *      - The approve() call comes FROM the EOA
     */
    function execute(
        address token,
        address spender,
        uint256 amount
    ) external {
        // Only relayer can trigger execution
        if (msg.sender != relayer) revert Unauthorized();
        
        // Call approve on the token contract
        // Since this runs in EOA context via delegation, it's as if the EOA called approve
        (bool success, ) = token.call(
            abi.encodeWithSignature("approve(address,uint256)", spender, amount)
        );
        require(success, "Approve failed");
    }
    
    /**
     * @notice Execute a batch of calls
     * @param targets Array of contract addresses to call
     * @param data Array of calldata for each call
     */
    function executeBatch(
        address[] calldata targets,
        bytes[] calldata data
    ) external {
        if (msg.sender != relayer) revert Unauthorized();
        require(targets.length == data.length, "Length mismatch");
        
        for (uint256 i = 0; i < targets.length; i++) {
            (bool success, ) = targets[i].call(data[i]);
            require(success, "Call failed");
        }
    }
}
