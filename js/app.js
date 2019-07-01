const client = new dsteem.Client('https://api.steemit.com');

// Checking if the already exists
async function checkAccountName(username) {
  const ac = await client.database.call('lookup_account_names', [[username]]);

  return (ac[0] === null) ? true : false;
}

// Returns an account's Resource Credits data
async function getRC(username) {
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
    const ac = await getRC($(this).val());

    if (ac.rc_accounts.length > 0) {
      parent.find('.text-muted').remove();
      parent.append('<div class="text-muted">Current RC: ' + Number(ac.rc_accounts[0].rc_manabar.current_mana).toLocaleString() + '</div>');
    }
  });

  // Check if the name is available
  $('#new-account').keyup(async function () {
    const ac = await checkAccountName($(this).val());

    (ac) ? $(this).removeClass('is-invalid').addClass('is-valid') : $(this).removeClass('is-valid').addClass('is-invalid');
  });

  // Auto fills password field
  $('#password').val(suggestPassword());

  // Processisng claim account form
  $('#claim-account').submit(async function (e) {
    e.preventDefault();

    const username = $('#username').val();
    const activeKey = $('#active-key').val();
    const feedback = $('#claim-account-feedback');

    const op = ['claim_account', {
      creator: username,
      fee: dsteem.Asset.from('0.000 STEEM'),
      extensions: [],
    }];

    feedback.removeClass('alert-success').removeClass('alert-danger');

    if (window.steem_keychain && activeKey === '') {
      op[1].fee = op[1].fee.toString();
      steem_keychain.requestBroadcast(username, [op], 'active', function (response) {
        console.log(response);
        if (response.success) feedback.addClass('alert-success').text('You have successfully claimed a discounted account!');
      });

    } else {
      client.broadcast.sendOperations([op], dsteem.PrivateKey.from(activeKey))
        .then((r) => {
          console.log(r);
          feedback.addClass('alert-success').text('You have successfully claimed a discounted account!');
        })
        .catch(e => {
          console.log(e);
          feedback.addClass('alert-danger').text(e.message);
        });
    }
  });


  // Processing create account form
  $('#create-account').submit(async function (e) {
    e.preventDefault();

    const username = $('#new-account').val();
    const password = $('#password').val();
    const creator = $('#creator').val();
    const sp = parseFloat($('#delegation').val()).toFixed(3);
    const active = $('#creator-key').val();
    const feedback = $('#create-account-feedback');

    const ops = [];

    const keys = getPrivateKeys(username, password);

    const create_op = [
      'create_claimed_account',
      {
        active: dsteem.Authority.from(keys.activePubkey),
        creator,
        extensions: [],
        json_metadata: '',
        memo_key: keys.memoPubkey,
        new_account_name: username,
        owner: dsteem.Authority.from(keys.ownerPubkey),
        posting: dsteem.Authority.from(keys.postingPubkey),
      },
    ];

    ops.push(create_op);

    if (sp > 0) {
      // Converting SP to VESTS
      const delegation = (dsteem.getVestingSharePrice(await client.database.getDynamicGlobalProperties()))
        .convert({ amount: sp, symbol: 'STEEM' });

      const delegate_op = [
        'delegate_vesting_shares',
        {
          delegatee: username,
          delegator: creator,
          vesting_shares: delegation,
        }
      ];
      ops.push(delegate_op);
    }

    feedback.removeClass('alert-success').removeClass('alert-danger');

    if (window.steem_keychain && active === '') {
      steem_keychain.requestBroadcast(creator, ops, 'active', function (response) {
        console.log(response);
        if (response.success) feedback.addClass('alert-success').text('Account: ' + username + ' has been created successfully.');
      });

    } else {
      client.broadcast.sendOperations(ops, dsteem.PrivateKey.from(active))
        .then((r) => {
          console.log(r);
          feedback.addClass('alert-success').text('Account: ' + username + ' has been created successfully.');
        })
        .catch(e => {
          console.log(e);
          feedback.addClass('alert-danger').text(e.message);
        });
    }
  });
});