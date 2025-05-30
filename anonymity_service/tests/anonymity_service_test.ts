import { Clarinet, Tx, Chain, Account, types } from 'https://deno.land/x/clarinet@v0.14.0/index.ts';
import { assertEquals } from 'https://deno.land/std@0.90.0/testing/asserts.ts';

Clarinet.test({
    name: "Ensure that contract initializes correctly and only once",
    async fn(chain: Chain, accounts: Map<string, Account>)
    {
        const deployer = accounts.get('deployer')!;
        const user1 = accounts.get('wallet_1')!;

        let block = chain.mineBlock([
            Tx.contractCall('anonymity_service', 'initialize', [], deployer.address)
        ]);

        // Check initialization success
        assertEquals(block.receipts.length, 1);
        assertEquals(block.receipts[0].result, '(ok true)');

        // Attempt to initialize again (should fail)
        block = chain.mineBlock([
            Tx.contractCall('anonymity_service', 'initialize', [], deployer.address)
        ]);

        assertEquals(block.receipts.length, 1);
        assertEquals(block.receipts[0].result, '(err u101)'); // err-already-initialized

        // Attempt to initialize as non-owner (should fail)
        block = chain.mineBlock([
            Tx.contractCall('anonymity_service', 'initialize', [], user1.address)
        ]);

        assertEquals(block.receipts.length, 1);
        assertEquals(block.receipts[0].result, '(err u100)'); // err-owner-only
    },
});

Clarinet.test({
    name: "Ensure that anonymous messages can be sent and retrieved",
    async fn(chain: Chain, accounts: Map<string, Account>)
    {
        const deployer = accounts.get('deployer')!;
        const user1 = accounts.get('wallet_1')!;

        // Initialize the contract
        chain.mineBlock([
            Tx.contractCall('anonymity_service', 'initialize', [], deployer.address)
        ]);

        // Send an anonymous message
        const content = "This is a test anonymous message for the blockchain service";
        let block = chain.mineBlock([
            Tx.contractCall(
                'anonymity_service',
                'send-anonymous-message',
                [types.utf8(content)],
                user1.address
            )
        ]);

        assertEquals(block.receipts.length, 1);
        assertEquals(block.receipts[0].result, '(ok u0)'); // First message ID

        // Retrieve the message
        const messageResult = chain.callReadOnlyFn(
            'anonymity_service',
            'get-message',
            [types.uint(0)],
            user1.address
        );

        // Extract and verify message content
        const resultString = messageResult.result.replace('(some ', '').slice(0, -1);
        assertEquals(resultString.includes(content), true);
        assertEquals(resultString.includes('sender: none'), true);
        assertEquals(resultString.includes('encrypted: false'), true);

        // Check message count
        const countResult = chain.callReadOnlyFn(
            'anonymity_service',
            'get-message-count',
            [],
            user1.address
        );

        assertEquals(countResult.result, 'u1');
    },
});

Clarinet.test({
    name: "Ensure service owner can pause and resume service",
    async fn(chain: Chain, accounts: Map<string, Account>)
    {
        const deployer = accounts.get('deployer')!;
        const user1 = accounts.get('wallet_1')!;

        // Initialize the contract
        chain.mineBlock([
            Tx.contractCall('anonymity_service', 'initialize', [], deployer.address)
        ]);

        // Pause the service
        let block = chain.mineBlock([
            Tx.contractCall('anonymity_service', 'pause-service', [], deployer.address)
        ]);

        assertEquals(block.receipts.length, 1);
        assertEquals(block.receipts[0].result, '(ok true)');

        // Try to send a message while paused (should fail)
        block = chain.mineBlock([
            Tx.contractCall(
                'anonymity_service',
                'send-anonymous-message',
                [types.utf8("This should fail because service is paused")],
                user1.address
            )
        ]);

        assertEquals(block.receipts.length, 1);
        assertEquals(block.receipts[0].result, '(err u102)'); // err-not-initialized

        // Resume the service
        block = chain.mineBlock([
            Tx.contractCall('anonymity_service', 'resume-service', [], deployer.address)
        ]);

        assertEquals(block.receipts.length, 1);
        assertEquals(block.receipts[0].result, '(ok true)');

        // Try to send a message after resuming (should succeed)
        block = chain.mineBlock([
            Tx.contractCall(
                'anonymity_service',
                'send-anonymous-message',
                [types.utf8("This should succeed after service resumed")],
                user1.address
            )
        ]);

        assertEquals(block.receipts.length, 1);
        assertEquals(block.receipts[0].result, '(ok u0)');

        // Verify non-owner cannot pause or resume
        block = chain.mineBlock([
            Tx.contractCall('anonymity_service', 'pause-service', [], user1.address)
        ]);

        assertEquals(block.receipts.length, 1);
        assertEquals(block.receipts[0].result, '(err u100)'); // err-owner-only

        block = chain.mineBlock([
            Tx.contractCall('anonymity_service', 'resume-service', [], user1.address)
        ]);

        assertEquals(block.receipts.length, 1);
        assertEquals(block.receipts[0].result, '(err u100)'); // err-owner-only
    },
});

Clarinet.test({
    name: "Test content validation and message existence checks",
    async fn(chain: Chain, accounts: Map<string, Account>)
    {
        const deployer = accounts.get('deployer')!;
        const user1 = accounts.get('wallet_1')!;

        // Initialize the contract
        chain.mineBlock([
            Tx.contractCall('anonymity_service', 'initialize', [], deployer.address)
        ]);

        // Check if short content is invalid
        const shortContentCheck = chain.callReadOnlyFn(
            'anonymity_service',
            'is-valid-content',
            [types.utf8("Short")],
            user1.address
        );

        assertEquals(shortContentCheck.result, 'false'); // Too short

        // Check if proper length content is valid
        const validContentCheck = chain.callReadOnlyFn(
            'anonymity_service',
            'is-valid-content',
            [types.utf8("This is a valid length message for testing")],
            user1.address
        );

        assertEquals(validContentCheck.result, 'true');

        // Check if non-existent message returns false
        const messageExistsCheck = chain.callReadOnlyFn(
            'anonymity_service',
            'does-message-exist',
            [types.uint(999)],
            user1.address
        );

        assertEquals(messageExistsCheck.result, 'false');

        // Send a message and verify it exists
        let block = chain.mineBlock([
            Tx.contractCall(
                'anonymity_service',
                'send-anonymous-message',
                [types.utf8("This is a test message to check existence")],
                user1.address
            )
        ]);

        const messageID = 0; // First message ID
        const messageExistsCheckAfter = chain.callReadOnlyFn(
            'anonymity_service',
            'does-message-exist',
            [types.uint(messageID)],
            user1.address
        );

        assertEquals(messageExistsCheckAfter.result, 'true');
    },
});

Clarinet.test({
    name: "Test bulk message sending functionality",
    async fn(chain: Chain, accounts: Map<string, Account>)
    {
        const deployer = accounts.get('deployer')!;
        const user1 = accounts.get('wallet_1')!;

        // Initialize the contract
        chain.mineBlock([
            Tx.contractCall('anonymity_service', 'initialize', [], deployer.address)
        ]);

        // Send bulk messages
        const content1 = "This is the first bulk message for testing purposes";
        const content2 = "This is the second bulk message sent in the same transaction";

        let block = chain.mineBlock([
            Tx.contractCall(
                'anonymity_service',
                'send-bulk-messages',
                [types.utf8(content1), types.utf8(content2)],
                user1.address
            )
        ]);

        assertEquals(block.receipts.length, 1);
        const resultObj = block.receipts[0].result.replace('{', '').replace('}', '').trim();
        assertEquals(resultObj.includes('first-id: u0'), true);
        assertEquals(resultObj.includes('second-id: u1'), true);

        // Check that messages were stored correctly
        const message1Result = chain.callReadOnlyFn(
            'anonymity_service',
            'get-message',
            [types.uint(0)],
            user1.address
        );

        const message2Result = chain.callReadOnlyFn(
            'anonymity_service',
            'get-message',
            [types.uint(1)],
            user1.address
        );

        const message1String = message1Result.result.replace('(some ', '').slice(0, -1);
        const message2String = message2Result.result.replace('(some ', '').slice(0, -1);

        assertEquals(message1String.includes(content1), true);
        assertEquals(message2String.includes(content2), true);

        // Try sending bulk messages with invalid content (too short)
        block = chain.mineBlock([
            Tx.contractCall(
                'anonymity_service',
                'send-bulk-messages',
                [types.utf8("Short"), types.utf8(content2)],
                user1.address
            )
        ]);

        assertEquals(block.receipts.length, 1);
        assertEquals(block.receipts[0].result, '(err u103)'); // err-invalid-message-length
    },
});

Clarinet.test({
    name: "Test message with category and encryption flag",
    async fn(chain: Chain, accounts: Map<string, Account>)
    {
        const deployer = accounts.get('deployer')!;
        const user1 = accounts.get('wallet_1')!;

        // Initialize the contract
        chain.mineBlock([
            Tx.contractCall('anonymity_service', 'initialize', [], deployer.address)
        ]);

        // Send message with category and encryption set to true
        const content = "This is a message with category and encryption flags set";
        const category = "TEST_CATEGORY";

        let block = chain.mineBlock([
            Tx.contractCall(
                'anonymity_service',
                'send-anonymous-message-with-category',
                [
                    types.utf8(content),
                    types.some(types.utf8(category)),
                    types.bool(true) // encrypted
                ],
                user1.address
            )
        ]);

        assertEquals(block.receipts.length, 1);
        assertEquals(block.receipts[0].result, '(ok u0)'); // Message ID should be 0

        // Retrieve and verify the message details
        const messageResult = chain.callReadOnlyFn(
            'anonymity_service',
            'get-message',
            [types.uint(0)],
            user1.address
        );

        const messageString = messageResult.result.replace('(some ', '').slice(0, -1);
        assertEquals(messageString.includes(content), true);
        assertEquals(messageString.includes(`category: (some "${category}")`), true);
        assertEquals(messageString.includes('encrypted: true'), true);

        // Check user message count
        const userCountResult = chain.callReadOnlyFn(
            'anonymity_service',
            'get-user-message-count',
            [types.principal(user1.address)],
            user1.address
        );

        assertEquals(userCountResult.result, 'u1');
    },
});

Clarinet.test({
    name: "Test message replies and depth tracking",
    async fn(chain: Chain, accounts: Map<string, Account>)
    {
        const deployer = accounts.get('deployer')!;
        const user1 = accounts.get('wallet_1')!;
        const user2 = accounts.get('wallet_2')!;

        // Initialize the contract
        chain.mineBlock([
            Tx.contractCall('anonymity_service', 'initialize', [], deployer.address)
        ]);

        // Send original message
        const originalContent = "This is the original message to reply to";

        let block = chain.mineBlock([
            Tx.contractCall(
                'anonymity_service',
                'send-anonymous-message',
                [types.utf8(originalContent)],
                user1.address
            )
        ]);

        const originalMsgId = 0; // First message ID

        // Reply to the original message (depth 1)
        const replyContent1 = "This is a reply to the original message (depth 1)";

        block = chain.mineBlock([
            Tx.contractCall(
                'anonymity_service',
                'reply-to-message',
                [types.utf8(replyContent1), types.uint(originalMsgId), types.bool(false)],
                user1.address
            )
        ]);

        assertEquals(block.receipts.length, 1);
        assertEquals(block.receipts[0].result, '(ok u1)'); // Second message ID

        // Check reply was recorded with correct depth
        const reply1Result = chain.callReadOnlyFn(
            'anonymity_service',
            'get-message',
            [types.uint(1)],
            user1.address
        );

        const reply1String = reply1Result.result.replace('(some ', '').slice(0, -1);
        assertEquals(reply1String.includes(replyContent1), true);
        assertEquals(reply1String.includes('reply-to: (some u0)'), true);
        assertEquals(reply1String.includes('reply-depth: u1'), true);

        // Check replies list on the original message
        const repliesResult = chain.callReadOnlyFn(
            'anonymity_service',
            'get-message-replies',
            [types.uint(originalMsgId)],
            user1.address
        );

        const repliesString = repliesResult.result.replace('(some ', '').slice(0, -1);
        assertEquals(repliesString.includes('u1'), true); // Should contain the reply ID

        // Create a chain of replies up to max depth
        let lastReplyId = 1; // ID of first reply

        // Create replies at depths 2, 3, 4, and 5
        for (let i = 2; i <= 5; i++)
        {
            const replyContent = `This is a reply at depth ${i}`;

            block = chain.mineBlock([
                Tx.contractCall(
                    'anonymity_service',
                    'reply-to-message',
                    [types.utf8(replyContent), types.uint(lastReplyId), types.bool(false)],
                    user2.address
                )
            ]);

            assertEquals(block.receipts.length, 1);
            assertEquals(block.receipts[0].result, `(ok u${i})`); // Message ID should increment

            lastReplyId = i;
        }

        // Check depth of the last reply should be 5
        const depthResult = chain.callReadOnlyFn(
            'anonymity_service',
            'get-message-depth',
            [types.uint(lastReplyId)],
            user1.address
        );

        assertEquals(depthResult.result, 'u5');

        // Try to reply beyond max depth (should fail)
        block = chain.mineBlock([
            Tx.contractCall(
                'anonymity_service',
                'reply-to-message',
                [types.utf8("This reply should fail - exceeds max depth"), types.uint(lastReplyId), types.bool(false)],
                user1.address
            )
        ]);

        assertEquals(block.receipts.length, 1);
        assertEquals(block.receipts[0].result, '(err u107)'); // err-invalid-reply-depth
    },
});

Clarinet.test({
    name: "Test rate limiting functionality",
    async fn(chain: Chain, accounts: Map<string, Account>)
    {
        const deployer = accounts.get('deployer')!;
        const user1 = accounts.get('wallet_1')!;

        // Initialize the contract
        chain.mineBlock([
            Tx.contractCall('anonymity_service', 'initialize', [], deployer.address)
        ]);

        // Update rate limits to a low number for testing
        let block = chain.mineBlock([
            Tx.contractCall(
                'anonymity_service',
                'update-rate-limits',
                [types.uint(10000), types.uint(3)], // window and max messages per window
                deployer.address
            )
        ]);

        assertEquals(block.receipts.length, 1);
        assertEquals(block.receipts[0].result, '(ok true)');

        // Send messages up to the limit (3 messages)
        const content = "This is a test message for rate limiting";

        for (let i = 0; i < 3; i++)
        {
            block = chain.mineBlock([
                Tx.contractCall(
                    'anonymity_service',
                    'send-anonymous-message-with-category',
                    [types.utf8(content + ` ${i + 1}`), types.none(), types.bool(false)],
                    user1.address
                )
            ]);

            assertEquals(block.receipts.length, 1);
            assertEquals(block.receipts[0].result, `(ok u${i})`);
        }

        // Check user message count
        const userCountResult = chain.callReadOnlyFn(
            'anonymity_service',
            'get-user-message-count',
            [types.principal(user1.address)],
            user1.address
        );

        assertEquals(userCountResult.result, 'u3');

        // Try to send a message beyond the limit (should fail)
        block = chain.mineBlock([
            Tx.contractCall(
                'anonymity_service',
                'send-anonymous-message-with-category',
                [types.utf8("This message should fail due to rate limiting"), types.none(), types.bool(false)],
                user1.address
            )
        ]);

        assertEquals(block.receipts.length, 1);
        assertEquals(block.receipts[0].result, '(err u109)'); // err-rate-limit-exceeded

        // Service owner should be able to update rate limits
        block = chain.mineBlock([
            Tx.contractCall(
                'anonymity_service',
                'update-rate-limits',
                [types.uint(10000), types.uint(5)], // Increase to 5 messages per window
                deployer.address
            )
        ]);

        assertEquals(block.receipts.length, 1);
        assertEquals(block.receipts[0].result, '(ok true)');

        // Should now be able to send more messages
        block = chain.mineBlock([
            Tx.contractCall(
                'anonymity_service',
                'send-anonymous-message-with-category',
                [types.utf8("This message should succeed after rate limit change"), types.none(), types.bool(false)],
                user1.address
            )
        ]);

        assertEquals(block.receipts.length, 1);
        assertEquals(block.receipts[0].result, '(ok u3)');
    },
});

Clarinet.test({
    name: "Test service fee management",
    async fn(chain: Chain, accounts: Map<string, Account>)
    {
        const deployer = accounts.get('deployer')!;
        const user1 = accounts.get('wallet_1')!;

        // Initialize the contract
        chain.mineBlock([
            Tx.contractCall('anonymity_service', 'initialize', [], deployer.address)
        ]);

        // Check default service fee
        let feeResult = chain.callReadOnlyFn(
            'anonymity_service',
            'get-service-fee',
            [],
            user1.address
        );

        assertEquals(feeResult.result, 'u100'); // Default fee from the contract

        // Update service fee
        const newFee = 250;
        let block = chain.mineBlock([
            Tx.contractCall(
                'anonymity_service',
                'update-service-fee',
                [types.uint(newFee)],
                deployer.address
            )
        ]);

        assertEquals(block.receipts.length, 1);
        assertEquals(block.receipts[0].result, '(ok true)');

        // Check updated fee
        feeResult = chain.callReadOnlyFn(
            'anonymity_service',
            'get-service-fee',
            [],
            user1.address
        );

        assertEquals(feeResult.result, `u${newFee}`);

        // Verify non-owner cannot update fee
        block = chain.mineBlock([
            Tx.contractCall(
                'anonymity_service',
                'update-service-fee',
                [types.uint(500)],
                user1.address
            )
        ]);

        assertEquals(block.receipts.length, 1);
        assertEquals(block.receipts[0].result, '(err u100)'); // err-owner-only
    },
});

Clarinet.test({
    name: "Test message retrieval, counts and edge cases",
    async fn(chain: Chain, accounts: Map<string, Account>)
    {
        const deployer = accounts.get('deployer')!;
        const user1 = accounts.get('wallet_1')!;

        // Initialize the contract
        chain.mineBlock([
            Tx.contractCall('anonymity_service', 'initialize', [], deployer.address)
        ]);

        // Send several messages
        const messages = [
            "First test message for retrieval testing",
            "Second test message with different content",
            "Third message to check multiple retrieval"
        ];

        for (let i = 0; i < messages.length; i++)
        {
            chain.mineBlock([
                Tx.contractCall(
                    'anonymity_service',
                    'send-anonymous-message',
                    [types.utf8(messages[i])],
                    user1.address
                )
            ]);
        }

        // Check message count
        const countResult = chain.callReadOnlyFn(
            'anonymity_service',
            'get-message-count',
            [],
            user1.address
        );

        assertEquals(countResult.result, `u${messages.length}`);

        // Check messages count in range
        const rangeCountResult = chain.callReadOnlyFn(
            'anonymity_service',
            'get-messages-count',
            [types.uint(0), types.uint(2)],
            user1.address
        );

        assertEquals(rangeCountResult.result, '(ok u2)');

        // Check invalid range
        const invalidRangeResult = chain.callReadOnlyFn(
            'anonymity_service',
            'get-messages-count',
            [types.uint(5), types.uint(2)],
            user1.address
        );

        assertEquals(invalidRangeResult.result, '(err u105)'); // err-invalid-message-count

        // Check get last message ID
        const lastIdResult = chain.callReadOnlyFn(
            'anonymity_service',
            'get-last-message-id',
            [],
            user1.address
        );

        assertEquals(lastIdResult.result, '(ok u2)'); // 0-indexed, so last of 3 is 2

        // Retrieve individual messages and verify content
        for (let i = 0; i < messages.length; i++)
        {
            const messageResult = chain.callReadOnlyFn(
                'anonymity_service',
                'get-message',
                [types.uint(i)],
                user1.address
            );

            const messageString = messageResult.result.replace('(some ', '').slice(0, -1);
            assertEquals(messageString.includes(messages[i]), true);
        }

        // Try to get non-existent message
        const nonExistentResult = chain.callReadOnlyFn(
            'anonymity_service',
            'get-message',
            [types.uint(999)],
            user1.address
        );

        assertEquals(nonExistentResult.result, 'none');
    },
});