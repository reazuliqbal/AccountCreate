const hiveClient = new dsteem.Client('https://api.hive.blog');
const steemClient = new dsteem.Client('https://api.steemit.com');

// Checking if the already exists
async function checkAccountName(client, username) {
  const ac = await client.database.call('lookup_account_names', [[username]]);

  return (ac[0] === null) ? true : false;
}

// Returns an account's Resource Credits data
async function getRC(client, username) {
  return client.call('rc_api', 'find_rc_accounts', { accounts: [username] });
}

// Generates Aall Private Keys from username and password
function getPrivateKeys(username, password, roles = ['owner', 'active', 'posting', 'memo']) {
  const privKeys = {};
  roles.forEach((role) => {
    privKeys[role] = dsteem.PrivateKey.fromLogin(username, password, role).toString();
    privKeys[`${role}Pubkey`] = dsteem.PrivateKey.from(privKeys[role]).createPublic().toString();
  });

  return privKeys;
};

// Creates a suggested password
function suggestPassword() {
  const array = new Uint32Array(10);
  window.crypto.getRandomValues(array);
  return 'P' + dsteem.PrivateKey.fromSeed(array).toString();
}

$(document).ready(async function () {

  // Checks and shows an account's RC
  $('#username').keyup(async function () {
    const parent = $(this).parent('.form-group');
    const steem = await getRC(steemClient, $(this).val());
    const hive = await getRC(hiveClient, $(this).val());

    const notifyDiv = parent.find('.text-muted');
    notifyDiv.empty();

    let message = '';

    if (hive.rc_accounts.length > 0) {
      message += 'HIVE RC: ' + Number(hive.rc_accounts[0].rc_manabar.current_mana).toLocaleString() + ' ';
    }

    if (steem.rc_accounts.length > 0) {
      message += 'STEEM RC: ' + Number(steem.rc_accounts[0].rc_manabar.current_mana).toLocaleString();
    }

    notifyDiv.text(message)
  });

  // Check if the name is available
  $('#new-account').keyup(async function () {
    const notifyDiv = $(this).parent('.form-group').find('.message');

    notifyDiv.text('Enter the username you want to create.');

    if ($(this).val().length >= 3) {
      const steem = await checkAccountName(steemClient, $(this).val());
      const hive = await checkAccountName(hiveClient, $(this).val());

      let message = '';
      message += (hive) ? '<span class="text-success">Availble on HIVE.</span> &nbsp;' : '<span class="text-danger">Not available on HIVE.</span> &nbsp;';
      message += (steem) ? '<span class="text-success">Availble on STEEM.</span> &nbsp;' : '<span class="text-danger">Not available on STEEM.</span> &nbsp;';

      notifyDiv.html(message);
    }
  });

  // Auto fills password field
  $('#password').val(suggestPassword());

  // Processisng claim account form
  $('#claim-account-steem').click(function (e) {
    $('#claim-account-chain').val('steem');

  });

  $('#claim-account-hive').click(function (e) {
    $('#claim-account-chain').val('hive');
  });

  $('#claim-account').submit(async function (e) {
    e.preventDefault();

    const chain = $('#claim-account-chain').val();
    const username = $('#username').val();
    const activeKey = $('#active-key').val();
    const feedbackDiv = $('#claim-account-feedback');

    feedbackDiv.removeClass('alert-success').removeClass('alert-danger').empty();

    const op = ['claim_account', {
      creator: username,
      fee: dsteem.Asset.from('0.000 STEEM'),
      extensions: [],
    }];

    if (activeKey === '') {
      op[1].fee = op[1].fee.toString();

      const keychain = (chain === 'hive') ? window.hive_keychain : window.steem_keychain;

      if (keychain) {
        keychain.requestBroadcast(username, [op], 'active', function (response) {
          if (response.success) {
            feedbackDiv.addClass('alert-success').text('You have successfully claimed a discounted account!');
          } else {
            feedbackDiv.addClass('alert-danger').text(response.message);
          }
        });
      } else {
        alert('STEEM and/or HIVE Keychain was not found.');
      }
    } else {
      const client = (chain === 'hive') ? hiveClient : steemClient;

      client.broadcast.sendOperations([op], dsteem.PrivateKey.from(activeKey))
        .then((r) => {
          console.log(r);
          feedbackDiv.addClass('alert-success').text('You have successfully claimed a discounted account!');
        })
        .catch(e => {
          console.log(e);
          feedbackDiv.addClass('alert-danger').text(e.message);
        });
    }
  });

  $('#create-account-steem').click(function (e) {
    $('#create-account-chain').val('steem');
  });

  $('#create-account-hive').click(function (e) {
    $('#create-account-chain').val('hive');
  });

  // Processing create account form
  $('#create-account').submit(async function (e) {
    e.preventDefault();

    const chain = $('#create-account-chain').val();
    const username = $('#new-account').val();
    const password = $('#password').val();
    const creator = $('#creator').val();
    const sp = parseFloat($('#delegation').val()).toFixed(3);
    const active = $('#creator-key').val();
    const feedbackDiv = $('#create-account-feedback');

    if (!username || !password || !creator) {
      return alert('Username, Password, Creator account is required.')
    }

    const ops = [];

    const keys = getPrivateKeys(username, password);

    const create_op = ['create_claimed_account', {
      active: dsteem.Authority.from(keys.activePubkey),
      creator,
      extensions: [],
      json_metadata: '',
      memo_key: keys.memoPubkey,
      new_account_name: username,
      owner: dsteem.Authority.from(keys.ownerPubkey),
      posting: dsteem.Authority.from(keys.postingPubkey),
    }];

    ops.push(create_op);

    if (sp > 0) {
      // Converting SP to VESTS
      const delegation = (dsteem.getVestingSharePrice(await client.database.getDynamicGlobalProperties()))
        .convert({ amount: sp, symbol: 'STEEM' });

      const delegate_op = ['delegate_vesting_shares', {
        delegatee: username,
        delegator: creator,
        vesting_shares: delegation,
      }];

      ops.push(delegate_op);
    }

    feedbackDiv.removeClass('alert-success').removeClass('alert-danger').empty();

    if (active === '') {
      const keychain = (chain === 'hive') ? window.hive_keychain : window.steem_keychain;

      if (keychain) {
        keychain.requestBroadcast(creator, ops, 'active', function (response) {
          console.log(response);
          if (response.success) {
            feedbackDiv.addClass('alert-success').text('Account: ' + username + ' has been created successfully.');
          } else {
            feedbackDiv.addClass('alert-danger').text(response.message);
          }
        });
      } else {
        alert('STEEM and/or HIVE Keychain was not found.');
      }
    } else {
      const client = (chain === 'hive') ? hiveClient : steemClient;

      client.broadcast.sendOperations(ops, dsteem.PrivateKey.from(active))
        .then((r) => {
          console.log(r);
          feedbackDiv.addClass('alert-success').text('Account: ' + username + ' has been created successfully.');
        })
        .catch(e => {
          console.log(e);
          feedbackDiv.addClass('alert-danger').text(e.message);
        });
    }
  });
});