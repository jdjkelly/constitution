const Polls = artifacts.require('../contracts/Polls.sol');

const assertRevert = require('./helpers/assertRevert');

contract('Polls', function([owner, user]) {
  let polls, duration, cooldown;
  const concrProp = '0x11ce09f4ebe9d12f6e3864d21a1e7dde126f34eb';
  const concrProp2 = '0x22ce09f4ebe9d12f6e3864d21a1e7dde126f34eb';
  const abstrProp =
    '0xabcde00000000000000000000000000000000000000000000000000000000000';
  const abstrProp2 =
    '0xcdef100000000000000000000000000000000000000000000000000000000000';

  // because setTimeout doesn't work.
  function busywait(s) {
    var start = Date.now();
    var ms = s * 1000;
    while (true) {
      if ((Date.now() - start) > ms) break;
    }
  }

  before('setting up for tests', async function() {
    polls = await Polls.new(1, 2);
    duration = 3;
    cooldown = 4;
  });

  it('configuring polls', async function() {
    assert.equal(await polls.pollDuration(), 1);
    assert.equal(await polls.pollCooldown(), 2);
    assert.equal(await polls.totalVoters(), 0);
    polls.reconfigure(duration, cooldown);
    for (var i = 0; i < 3; i++) {
      await polls.incrementTotalVoters();
    }
    assert.equal(await polls.pollDuration(), duration);
    assert.equal(await polls.pollCooldown(), cooldown);
    assert.equal(await polls.totalVoters(), 3);
  });

  it('concrete poll start & majority', async function() {
    assert.isFalse(await polls.concreteMajorityMap(concrProp));
    // non-owner can't do this.
    await assertRevert(polls.startConcretePoll(concrProp, {from:user}));
    await polls.startConcretePoll(concrProp);
    let cPoll = await polls.concretePolls(concrProp);
    assert.notEqual(cPoll[0], 0);
    // non-owner can't do this.
    await assertRevert(polls.castConcreteVote(0, concrProp, true, {from:user}));
    // cast votes.
    // we use .call to check the result first, then actually transact.
    assert.isFalse(await polls.castConcreteVote.call(0, concrProp, true));
    await polls.castConcreteVote(0, concrProp, true);
    assert.isTrue(await polls.hasVotedOnConcretePoll(0, concrProp));
    // can't vote twice.
    await assertRevert(polls.castConcreteVote(0, concrProp, true));
    assert.isFalse(await polls.castConcreteVote.call(1, concrProp, false));
    await polls.castConcreteVote(1, concrProp, false);
    assert.isTrue(await polls.castConcreteVote.call(2, concrProp, true));
    await polls.castConcreteVote(2, concrProp, true);
    assert.isTrue(await polls.concreteMajorityMap(concrProp));
    cPoll = await polls.concretePolls(concrProp);
    assert.equal(cPoll[1], 2);
    assert.equal(cPoll[2], 1);
    // can't vote on finished poll
    await assertRevert(polls.castConcreteVote(3, concrProp, true));
  });

  it('concrete poll minority & restart', async function() {
    // start poll and wait for it to time out
    await polls.startConcretePoll(concrProp2);
    await polls.castConcreteVote(0, concrProp2, false);
    busywait(duration);
    // can't vote on finished poll
    await assertRevert(polls.castConcreteVote(1, concrProp2, true));
    // can't recreate right away.
    await assertRevert(polls.startConcretePoll(concrProp2));
    busywait(cooldown * 1.3); // make timing less tight
    // recreate poll.
    await polls.startConcretePoll(concrProp2);
    let cPoll = await polls.concretePolls(concrProp2);
    assert.equal(cPoll[1], 0);
    assert.equal(cPoll[2], 0);
    assert.isFalse(await polls.hasVotedOnConcretePoll(0, concrProp2));
    // test timeout majority
    await polls.castConcreteVote(0, concrProp2, true);
    assert.isTrue(await polls.hasVotedOnConcretePoll(0, concrProp2));
    busywait(duration * 1.3); // make timing less tight
    assert.isTrue(await polls.updateConcretePoll.call(concrProp2));
    await polls.updateConcretePoll(concrProp2);
    assert.isTrue(await polls.concreteMajorityMap(concrProp2));
    // can't recreate once majority happened
    await assertRevert(polls.startConcretePoll(concrProp2));
  });

  it('abstract poll start & majority', async function() {
    assert.isFalse(await polls.abstractMajorityMap(abstrProp));
    let mas = await polls.getAbstractMajorities();
    assert.equal(mas.length, 0);
    // non-owner can't do this.
    await assertRevert(polls.startAbstractPoll(abstrProp, {from:user}));
    await polls.startAbstractPoll(abstrProp);
    let aPoll = await polls.abstractPolls(abstrProp);
    assert.notEqual(aPoll[0], 0);
    // non-owner can't do this.
    await assertRevert(polls.castAbstractVote(0, abstrProp, true, {from:user}));
    // cast votes.
    await polls.castAbstractVote(0, abstrProp, true);
    assert.isTrue(await polls.hasVotedOnAbstractPoll(0, abstrProp));
    // can't vote twice.
    await assertRevert(polls.castAbstractVote(0, abstrProp, true));
    await polls.castAbstractVote(1, abstrProp, false);
    await polls.castAbstractVote(2, abstrProp, true);
    assert.isTrue(await polls.abstractMajorityMap(abstrProp));
    mas = await polls.getAbstractMajorities();
    assert.equal(mas.length, 1);
    assert.equal(mas[0], abstrProp);
    aPoll = await polls.abstractPolls(abstrProp);
    assert.equal(aPoll[1], 2);
    assert.equal(aPoll[2], 1);
    // can't vote on finished poll
    await assertRevert(polls.castAbstractVote(3, abstrProp, true));
    // can't recreate once majority happened.
    await assertRevert(polls.startAbstractPoll(abstrProp));
  });

  it('abstract poll minority & restart', async function() {
    // start poll and wait for it to time out
    await polls.startAbstractPoll(abstrProp2);
    await polls.castAbstractVote(0, abstrProp2, false);
    busywait(duration);
    // can't vote on finished poll
    await assertRevert(polls.castAbstractVote(1, abstrProp2, true));
    // can't recreate right away.
    await assertRevert(polls.startAbstractPoll(abstrProp2));
    busywait(cooldown * 1.3); // make timing less tight
    // recreate poll.
    await polls.startAbstractPoll(abstrProp2);
    let aPoll = await polls.abstractPolls(abstrProp2);
    assert.equal(aPoll[1], 0);
    assert.equal(aPoll[2], 0);
    assert.isFalse(await polls.hasVotedOnAbstractPoll(0, abstrProp2));
    // test timeout majority
    await polls.castAbstractVote(0, abstrProp2, true);
    assert.isTrue(await polls.hasVotedOnAbstractPoll(0, abstrProp2));
    busywait(duration * 1.3); // make timing less tight
    await polls.updateAbstractPoll(abstrProp2);
    assert.isTrue(await polls.abstractMajorityMap(abstrProp2));
  });
});
