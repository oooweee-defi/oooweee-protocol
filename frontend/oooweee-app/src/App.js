import React, { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import toast, { Toaster } from 'react-hot-toast';
import './App.css';
import oooweeLogo from './assets/oooweee-logo.png';
import { OOOWEEE_TOKEN_ABI, OOOWEEE_SAVINGS_ABI, CONTRACT_ADDRESSES } from './contracts/abis';
import Web3Modal from "web3modal";
import { EthereumProvider } from '@walletconnect/ethereum-provider';

// Web3Modal provider options
const providerOptions = {
  walletconnect: {
    package: EthereumProvider,
    options: {
      projectId: "2f5a2b8e3d6c4f8a9e7d6c5b4a3f2e1d", // You can use this test ID
      chains: [11155111],
      showQrModal: true,
      rpcMap: {
        11155111: "https://sepolia.infura.io/v3/9aa3d95b3bc440fa88ea12eaa4456161"
      }
    }
  }
};

function App() {
  const [account, setAccount] = useState(null);
  const [provider, setProvider] = useState(null);
  const [tokenContract, setTokenContract] = useState(null);
  const [savingsContract, setSavingsContract] = useState(null);
  const [balance, setBalance] = useState('0');
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [accountType, setAccountType] = useState('time');
  const [showCompleted, setShowCompleted] = useState(false);
  const [isAppLoading, setIsAppLoading] = useState(true);
  const [ethPrice, setEthPrice] = useState(null);
  const [displayCurrency, setDisplayCurrency] = useState('fiat'); // Default to fiat (EUR)
  const [web3Modal, setWeb3Modal] = useState(null);
  const [targetAmountInput, setTargetAmountInput] = useState('');

  // OOOWEEE to ETH conversion rate (example: 1 OOOWEEE = 0.00001 ETH)
  const OOOWEEE_TO_ETH = 0.00001;

  // Initialize Web3Modal
  useEffect(() => {
    const modal = new Web3Modal({
      network: "sepolia",
      cacheProvider: true,
      providerOptions
    });
    setWeb3Modal(modal);
  }, []);

  // Loading screen
  useEffect(() => {
    setTimeout(() => setIsAppLoading(false), 2000);
  }, []);

  // Fetch ETH price
  useEffect(() => {
    fetchEthPrice();
    const interval = setInterval(fetchEthPrice, 60000); // Update every minute
    return () => clearInterval(interval);
  }, []);

  const fetchEthPrice = async () => {
    try {
      const response = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd,eur,gbp');
      const data = await response.json();
      setEthPrice(data.ethereum);
    } catch (error) {
      console.error('Failed to fetch ETH price');
    }
  };

  // Calculate fiat value
  const getOooweeeInFiat = (oooweeeAmount, currency = 'eur') => {
    if (!ethPrice) return '...';
    const ethValue = parseFloat(oooweeeAmount) * OOOWEEE_TO_ETH;
    const fiatValue = ethValue * ethPrice[currency];
    return new Intl.NumberFormat('en-IE', {
      style: 'currency',
      currency: currency.toUpperCase(),
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(fiatValue);
  };

  // Convert EUR to OOOWEEE amount
  const convertEurToOooweee = (eurAmount) => {
    if (!ethPrice || !eurAmount) return 0;
    const ethValue = parseFloat(eurAmount) / ethPrice.eur;
    const oooweeeAmount = ethValue / OOOWEEE_TO_ETH;
    return Math.floor(oooweeeAmount);
  };

  // Connect Wallet with Web3Modal
  const connectWallet = async () => {
    try {
      const instance = await web3Modal.connect();
      const provider = new ethers.providers.Web3Provider(instance);
      const signer = provider.getSigner();
      const address = await signer.getAddress();
      
      // Check if on Sepolia
      const network = await provider.getNetwork();
      if (network.chainId !== 11155111) {
        try {
          await instance.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: '0xaa36a7' }], // Sepolia chainId
          });
        } catch (switchError) {
          if (switchError.code === 4902) {
            toast.error('Please add Sepolia network to your wallet');
            return;
          }
        }
      }
      
      const tokenContract = new ethers.Contract(
        CONTRACT_ADDRESSES.token,
        OOOWEEE_TOKEN_ABI,
        signer
      );
      
      const savingsContract = new ethers.Contract(
        CONTRACT_ADDRESSES.savings,
        OOOWEEE_SAVINGS_ABI,
        signer
      );

      setAccount(address);
      setProvider(provider);
      setTokenContract(tokenContract);
      setSavingsContract(savingsContract);
      
      toast.success('Wallet connected! OOOWEEE!');
      
      // Load balances
      loadBalances(address, provider, tokenContract);
      loadSavingsAccounts(address, savingsContract);
      
      // Subscribe to accounts change
      instance.on("accountsChanged", (accounts) => {
        if (accounts.length === 0) {
          disconnectWallet();
        } else {
          window.location.reload();
        }
      });

      // Subscribe to chainId change
      instance.on("chainChanged", () => {
        window.location.reload();
      });
      
    } catch (error) {
      console.error(error);
      toast.error('Failed to connect wallet');
    }
  };

  // Disconnect wallet
  const disconnectWallet = async () => {
    if (web3Modal) {
      web3Modal.clearCachedProvider();
    }
    setAccount(null);
    setProvider(null);
    setTokenContract(null);
    setSavingsContract(null);
    setBalance('0');
    setAccounts([]);
  };

  // Load Balances
  const loadBalances = async (account, provider, tokenContract) => {
    try {
      
      const tokenBal = await tokenContract.balanceOf(account);
      setBalance(ethers.utils.formatUnits(tokenBal, 18));
    } catch (error) {
      console.error('Error loading balances:', error);
    }
  };

  // Load Savings Accounts
  const loadSavingsAccounts = async (account, savingsContract) => {
    try {
      const accountIds = await savingsContract.getUserAccounts(account);
      const accountDetails = [];
      
      for (let id of accountIds) {
        const info = await savingsContract.getAccountInfo(account, id);
        accountDetails.push({
          id: id.toString(),
          type: info[0],
          goalName: info[1],
          balance: ethers.utils.formatUnits(info[2], 18),
          target: ethers.utils.formatUnits(info[3], 18),
          unlockTime: info[4].toString(),
          recipient: info[5],
          isActive: info[6],
          progress: info[7].toString(),
          status: info[8]
        });
      }
      
      setAccounts(accountDetails);
    } catch (error) {
      console.error('Error loading accounts:', error);
    }
  };

  // Create Time Account
  const createTimeAccount = async (unlockDate, goalName) => {
    try {
      setLoading(true);
      const unlockTime = Math.floor(new Date(unlockDate).getTime() / 1000);
      
      const creationFee = await savingsContract.accountCreationFee();
      const approveTx = await tokenContract.approve(CONTRACT_ADDRESSES.savings, creationFee);
      
      await toast.promise(
        approveTx.wait(),
        {
          loading: '🔓 Approving tokens...',
          success: '✅ Tokens approved!',
          error: '❌ Failed to approve'
        }
      );
      
      const createTx = await savingsContract.createTimeAccount(unlockTime, goalName);
      
      await toast.promise(
        createTx.wait(),
        {
          loading: '🐷 Creating piggy bank...',
          success: '🎉 Time account created! OOOWEEE!',
          error: '❌ Failed to create account'
        }
      );
      
      await loadSavingsAccounts(account, savingsContract);
      await loadBalances(account, provider, tokenContract);
    } catch (error) {
      console.error(error);
      if (error.code === 'ACTION_REJECTED') {
        toast.error('Transaction cancelled');
      } else {
        toast.error('Failed to create account');
      }
    } finally {
      setLoading(false);
    }
  };

  // Create Growth Account - Modified to accept EUR input
  const createGrowthAccount = async (targetAmountEur, goalName) => {
    try {
      setLoading(true);
      const targetOooweee = convertEurToOooweee(targetAmountEur);
      const target = ethers.utils.parseUnits(targetOooweee.toString(), 18);
      
      const creationFee = await savingsContract.accountCreationFee();
      const approveTx = await tokenContract.approve(CONTRACT_ADDRESSES.savings, creationFee);
      
      await toast.promise(
        approveTx.wait(),
        {
          loading: '🔓 Approving tokens...',
          success: '✅ Tokens approved!',
          error: '❌ Failed to approve'
        }
      );
      
      const createTx = await savingsContract.createGrowthAccount(target, goalName);
      
      await toast.promise(
        createTx.wait(),
        {
          loading: '🌱 Planting seed...',
          success: '🌳 Growth account created! OOOWEEE!',
          error: '❌ Failed to create account'
        }
      );
      
      await loadSavingsAccounts(account, savingsContract);
      await loadBalances(account, provider, tokenContract);
    } catch (error) {
      console.error(error);
      if (error.code === 'ACTION_REJECTED') {
        toast.error('Transaction cancelled');
      } else {
        toast.error('Failed to create account');
      }
    } finally {
      setLoading(false);
    }
  };

  // Create Balance Account - Modified to accept EUR input
  const createBalanceAccount = async (targetAmountEur, recipientAddress, goalName) => {
    try {
      setLoading(true);
      const targetOooweee = convertEurToOooweee(targetAmountEur);
      const target = ethers.utils.parseUnits(targetOooweee.toString(), 18);
      
      if (!ethers.utils.isAddress(recipientAddress)) {
        toast.error('Invalid recipient address');
        return;
      }
      
      const creationFee = await savingsContract.accountCreationFee();
      const approveTx = await tokenContract.approve(CONTRACT_ADDRESSES.savings, creationFee);
      
      await toast.promise(
        approveTx.wait(),
        {
          loading: '🔓 Approving tokens...',
          success: '✅ Tokens approved!',
          error: '❌ Failed to approve'
        }
      );
      
      const createTx = await savingsContract.createBalanceAccount(target, recipientAddress, goalName);
      
      await toast.promise(
        createTx.wait(),
        {
          loading: '⚖️ Setting up scale...',
          success: '💸 Balance account created! OOOWEEE!',
          error: '❌ Failed to create account'
        }
      );
      
      await loadSavingsAccounts(account, savingsContract);
      await loadBalances(account, provider, tokenContract);
    } catch (error) {
      console.error(error);
      if (error.code === 'ACTION_REJECTED') {
        toast.error('Transaction cancelled');
      } else {
        toast.error('Failed to create account');
      }
    } finally {
      setLoading(false);
    }
  };

  // Handle account creation based on type
  const handleCreateAccount = () => {
    const goalName = document.getElementById('goalName').value;
    
    if (!goalName) {
      toast.error('Please enter a goal name');
      return;
    }
    
    if (accountType === 'time') {
      const unlockDate = document.getElementById('unlockDate').value;
      if (!unlockDate) {
        toast.error('Please select an unlock date');
        return;
      }
      createTimeAccount(unlockDate, goalName);
    } else if (accountType === 'growth') {
      const targetAmount = document.getElementById('targetAmount').value;
      if (!targetAmount || targetAmount <= 0) {
        toast.error('Please enter a valid target amount');
        return;
      }
      createGrowthAccount(targetAmount, goalName);
    } else if (accountType === 'balance') {
      const targetAmount = document.getElementById('targetAmount').value;
      const recipientAddress = document.getElementById('recipientAddress').value;
      if (!targetAmount || targetAmount <= 0) {
        toast.error('Please enter a valid target amount');
        return;
      }
      if (!recipientAddress) {
        toast.error('Please enter a recipient address');
        return;
      }
      createBalanceAccount(targetAmount, recipientAddress, goalName);
    }
  };

  // Simplified Deposit to Account
  const depositToAccount = async (accountId, amount) => {
    try {
      setLoading(true);
      const depositAmount = ethers.utils.parseUnits(amount.toString(), 18);
      
      const approveTx = await tokenContract.approve(CONTRACT_ADDRESSES.savings, depositAmount);
      
      await toast.promise(
        approveTx.wait(),
        {
          loading: '🔓 Approving tokens...',
          success: '✅ Tokens approved!',
          error: '❌ Failed to approve'
        }
      );
      
      const depositTx = await savingsContract.deposit(accountId, depositAmount);
      
      await toast.promise(
        depositTx.wait(),
        {
          loading: '💰 Depositing...',
          success: `🎉 Deposited ${amount} $OOOWEEE!`,
          error: '❌ Failed to deposit'
        }
      );
      
      // Reload data
      await loadSavingsAccounts(account, savingsContract);
      await loadBalances(account, provider, tokenContract);

    } catch (error) {
      console.error(error);
      if (error.code === 'ACTION_REJECTED') {
        toast.error('Transaction cancelled');
      } else {
        toast.error('Failed to deposit');
      }
    } finally {
      setLoading(false);
    }
  };

  // Calculate days remaining for time accounts
  const getDaysRemaining = (unlockTime) => {
    const now = Math.floor(Date.now() / 1000);
    const remaining = unlockTime - now;
    return Math.max(0, Math.floor(remaining / 86400));
  };

  // Filter accounts
  const activeAccounts = accounts.filter(acc => acc.isActive);
  const completedAccounts = accounts.filter(acc => !acc.isActive);

  // Show loading screen
  if (isAppLoading) {
    return (
      <div className="loading-screen">
        <img 
          src={oooweeLogo} 
          alt="Loading..." 
          className="loading-logo pixel-art"
        />
        <div className="loading-bar">
          <div className="loading-progress"></div>
        </div>
        <p className="loading-text">Loading OOOWEEE Protocol...</p>
      </div>
    );
  }

  return (
    <div className="App">
      <Toaster position="top-right" />
      
      {/* Floating coins background */}
      <div className="floating-coins">
        {[...Array(10)].map((_, i) => (
          <div
            key={i}
            className="coin"
            style={{
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
              animationDelay: `${Math.random() * 3}s`
            }}
          >
            🪙
          </div>
        ))}
      </div>
      
      <header className="App-header">
        <div className="hero-section">
          <img 
            src={oooweeLogo} 
            alt="OOOWEEE" 
            className="main-logo pixel-art"
          />
          <p className="tagline">OOOWEEE! Make your savings goals non-negotiable!</p>
        </div>

        {!account ? (
          <div className="connect-section">
            <div className="welcome-card">
              <h3>🎮 Welcome to Digital Savings!</h3>
              <div className="feature-grid">
                <div className="feature">
                  <span className="icon">🏦</span>
                  <h4>Like a Bank Account</h4>
                  <p>Save money for your goals</p>
                </div>
                <div className="feature">
                  <span className="icon">🔒</span>
                  <h4>But More Secure</h4>
                  <p>Protected by blockchain</p>
                </div>
                <div className="feature">
                  <span className="icon">🌍</span>
                  <h4>Works Globally</h4>
                  <p>Send anywhere instantly</p>
                </div>
              </div>
            </div>
            <button onClick={connectWallet} className="connect-btn rainbow-btn">
              <span>🔗</span> Connect Wallet
            </button>
            <p className="info-text">Works with MetaMask, Trust Wallet, and more!</p>
            <p className="disclaimer">💡 Values shown in EUR are estimates based on current market rates</p>
          </div>
        ) : (
          <div className="dashboard">
            <div className="wallet-info">
              <div className="wallet-card">
                <div className="wallet-header">
                  <h3>💰 Wallet Status</h3>
                  <span className="address">{account.slice(0, 6)}...{account.slice(-4)}</span>
                  <button onClick={disconnectWallet} className="disconnect-btn">
                    Disconnect
                  </button>
                </div>
                
                <div className="currency-toggle">
                  <button 
                    className={`toggle-btn ${displayCurrency === 'crypto' ? 'active' : ''}`}
                    onClick={() => setDisplayCurrency('crypto')}
                  >
                    🪙 Crypto
                  </button>
                  <button 
                    className={`toggle-btn ${displayCurrency === 'fiat' ? 'active' : ''}`}
                    onClick={() => setDisplayCurrency('fiat')}
                  >
                    💶 EUR
                  </button>
                </div>

                
                
                <div className="balance-row highlight">
                  <span>$OOOWEEE:</span>
                  <span>
                    {displayCurrency === 'crypto' 
                      ? `${parseFloat(balance).toLocaleString()} $OOOWEEE`
                      : getOooweeeInFiat(balance, 'eur')
                    }
                  </span>
                </div>
                {displayCurrency === 'fiat' && (
                  <p className="conversion-note">
                    ≈ {parseFloat(balance).toLocaleString()} $OOOWEEE
                  </p>
                )}
              </div>
            </div>
            
            <div className="accounts-container">
              <div className="section-header">
                <h2>🎮 Active Savings Quests</h2>
                {completedAccounts.length > 0 && (
                  <button 
                    className="toggle-completed"
                    onClick={() => setShowCompleted(!showCompleted)}
                  >
                    {showCompleted ? '👁️ Hide' : '👁️ Show'} Completed ({completedAccounts.length})
                  </button>
                )}
              </div>
              
              {activeAccounts.length === 0 && completedAccounts.length === 0 ? (
                <div className="empty-state">
                  <p>🎯 No savings quests yet!</p>
                  <p>Start your first quest below!</p>
                </div>
              ) : (
                <>
                  <div className="accounts-grid">
                    {activeAccounts.map(acc => (
                      <div key={acc.id} className="account-card active">
                        <div className="account-header">
                          <h3>{acc.goalName}</h3>
                          <span className={`account-type ${acc.type.toLowerCase()}`}>
                            {acc.type === 'Time' && '⏰'}
                            {acc.type === 'Growth' && '🌱'}
                            {acc.type === 'Balance' && '⚖️'}
                            {acc.type}
                          </span>
                        </div>
                        
                        <div className="account-details">
                          <div className="balance-display">
                            <div className="detail-row">
                              <span>Balance:</span>
                              <span className="primary-amount">
                                {displayCurrency === 'crypto'
                                  ? `${parseFloat(acc.balance).toLocaleString()} $OOOWEEE`
                                  : getOooweeeInFiat(acc.balance, 'eur')
                                }
                              </span>
                            </div>
                            {displayCurrency === 'fiat' && (
                              <span className="secondary-amount">
                                ≈ {parseFloat(acc.balance).toLocaleString()} $OOOWEEE
                              </span>
                            )}
                          </div>
                          
                          {acc.type === 'Time' && (
                            <div className="detail-row">
                              <span>Days Remaining:</span>
                              <span className="value">{getDaysRemaining(acc.unlockTime)}</span>
                            </div>
                          )}
                          
                          {acc.type === 'Growth' && (
                            <div className="detail-row">
                              <span>Target:</span>
                              <span className="value">
                                {displayCurrency === 'crypto'
                                  ? `${parseFloat(acc.target).toLocaleString()} $OOOWEEE`
                                  : getOooweeeInFiat(acc.target, 'eur')
                                }
                              </span>
                            </div>
                          )}
                          
                          {acc.type === 'Balance' && (
                            <>
                              <div className="detail-row">
                                <span>Target:</span>
                                <span className="value">
                                  {displayCurrency === 'crypto'
                                    ? `${parseFloat(acc.target).toLocaleString()} $OOOWEEE`
                                    : getOooweeeInFiat(acc.target, 'eur')
                                  }
                                </span>
                              </div>
                              <div className="detail-row">
                                <span>To:</span>
                                <span className="value address">{acc.recipient.slice(0, 6)}...{acc.recipient.slice(-4)}</span>
                              </div>
                              <p className="info-note">📝 Need 101% for auto-transfer</p>
                            </>
                          )}
                          
                          <div className="progress-section">
                            <div className="progress-bar">
                              <div 
                                className="progress-fill rainbow-fill"
                                style={{ width: `${Math.min(acc.progress, 100)}%` }}
                              />
                            </div>
                            <span className="progress-text">{acc.progress}% Complete</span>
                          </div>
                          
                          <p className="status-text">{acc.status}</p>
                        </div>
                        
                        <div className="deposit-section">
                          <input 
                            type="number" 
                            placeholder="Amount to deposit"
                            id={`deposit-${acc.id}`}
                            min="1"
                            className="deposit-input"
                          />
                          <button 
                            onClick={() => {
                              const amount = document.getElementById(`deposit-${acc.id}`).value;
                              if (amount && amount > 0) {
                                depositToAccount(acc.id, amount);
                              } else {
                                toast.error('Enter an amount');
                              }
                            }}
                            disabled={loading}
                            className="deposit-btn"
                          >
                            💰 DEPOSIT
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                  
                  {showCompleted && completedAccounts.length > 0 && (
                    <div className="completed-section">
                      <h3>✅ Completed Quests</h3>
                      <div className="accounts-grid">
                        {completedAccounts.map(acc => (
                          <div key={acc.id} className="account-card completed">
                            <div className="account-header">
                              <h3>{acc.goalName} ✅</h3>
                              <span className={`account-type ${acc.type.toLowerCase()}`}>
                                {acc.type}
                              </span>
                            </div>
                            <div className="account-details">
                              <p className="completed-text">🏆 Quest Complete!</p>
                              <p>Final: {displayCurrency === 'crypto'
                                ? `${parseFloat(acc.target || acc.balance).toLocaleString()} $OOOWEEE`
                                : getOooweeeInFiat(acc.target || acc.balance, 'eur')
                              }</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
            
            <div className="create-section">
              <h2>🎮 Start New Savings Quest</h2>
              
              <div className="form-group">
                <select 
                  id="accountType" 
                  value={accountType}
                  onChange={(e) => setAccountType(e.target.value)}
                  className="select-input"
                >
                  <option value="time">⏰ Time Quest - Lock until date</option>
                  <option value="growth">🌱 Growth Quest - Grow to target</option>
                  <option value="balance">⚖️ Balance Quest - Send at target</option>
                </select>
              </div>
              
              <div className="form-group">
                <input 
                  type="text" 
                  placeholder="Quest name (e.g., Epic Vacation)" 
                  id="goalName"
                  className="text-input"
                />
              </div>
              
              {accountType === 'time' && (
                <div className="form-group">
                  <label>🗓️ Unlock Date:</label>
                  <input 
                    type="date" 
                    id="unlockDate"
                    min={new Date().toISOString().split('T')[0]}
                    className="date-input"
                  />
                </div>
              )}
              
              {(accountType === 'growth' || accountType === 'balance') && (
                <div className="form-group">
                  <input 
                    type="number" 
                    placeholder="Target amount in EUR (€)"
                    id="targetAmount"
                    min="1"
                    step="0.01"
                    className="number-input"
                    value={targetAmountInput}
                    onChange={(e) => setTargetAmountInput(e.target.value)}
                  />
                  {ethPrice && targetAmountInput && (
                    <p className="input-helper">
                      ≈ {convertEurToOooweee(targetAmountInput).toLocaleString()} $OOOWEEE
                    </p>
                  )}
                </div>
              )}
              
              {accountType === 'balance' && (
                <div className="form-group">
                  <input 
                    type="text" 
                    placeholder="Recipient wallet (0x...)"
                    id="recipientAddress"
                    className="text-input"
                  />
                  <p className="help-text">
                    ⚠️ Save 101% to cover the 1% transfer fee!
                  </p>
                </div>
              )}
              
              <button 
                onClick={handleCreateAccount}
                disabled={loading}
                className="create-btn rainbow-btn"
              >
                {loading ? '⏳ Creating Quest...' : '🚀 START QUEST'}
              </button>
              
              <p className="fee-note">
                Creation fee: 100 $OOOWEEE {ethPrice && `(≈ ${getOooweeeInFiat(100, 'eur')})`}
              </p>
            </div>
          </div>
        )}
      </header>
    </div>
  );
}

export default App;