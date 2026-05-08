# Test Scenarios

## Scenario: Answer-first redirect
Type: unit
Setup: collecting_contact state
Steps:
1. User asks off-topic question
Expected: answer first, then request contact
Not-expected: request contact before answer

## Scenario: Multi-slot acceptance
Type: unit
Setup: active booking task
Steps:
1. User provides name/date/time/service/phone in one message
Expected: all slots captured, only remaining missing field asked
Not-expected: re-ask already provided service
