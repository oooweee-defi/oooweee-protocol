import React, { useState, useEffect, useCallback } from 'react';
import { ethers } from 'ethers';
import toast, { Toaster } from 'react-hot-toast';
import './App.css';
import oooweeLogo from './assets/oooweee-logo.png';
import { OOOWEEE_TOKEN_ABI, OOOWEEE_SAVINGS_ABI, OOOWEEE_VALIDATORS_ABI, CONTRACT_ADDRESSES } from './contracts/abis';
import Web3Modal from "web3modal";
import WalletConnectProvider from "@walletconnect/web3-provider";

// Web3Modal provider options - Fixed for mobile compatibility
const providerOptions = {
  walletconnect: {
    package: WalletConnectProvider,
    options: {
      projectId: "084d65a488f56065ea7a901e023a8b3e",
      infuraId: "9aa3d95b3bc440fa88ea12eaa4456161",
      rpc: {
        11155111: "https://sepolia.infura.io/v3/9aa3d95b3bc440fa88ea12eaa4456161"
      },
      chainId: 11155111,
      bridge: "https://bridge.walletconnect.org",
      qrcode: true,
      qrcodeModalOptions: {
        mobileLinks: [
          "metamask",
          "trust",
          "rainbow",
          "argent",
          "imtoken",
          "pillar",
          "coinbase"
        ]
      }
    }
  },
  injected: {
    display: {
      name: "Injected",
      description: "Connect with the provider in your browser"
    },
    package: null
  }
};

function App() {
  const [account, setAccount] = useState(null);
  const [provider, setProvider] = useState(null);
  const [tokenContract, setTokenContract] = useState(null);
  const [savingsContract, setSavingsContract] = useState(null);
  const [validatorsContract, setValidatorsContract] = useState(null);
  const [balance, setBalance] = useState('0');
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [accountType, setAccountType] = useState('time');
  const [showCompleted, setShowCompleted] = useState(false);
  const [isAppLoading, setIsAppLoading] = useState(true);
  const [ethPrice, setEthPrice] = useState(null);
  const [displayCurrency, setDisplayCurrency] = useState('fiat');
  const [web3Modal, setWeb3Modal] = useState(null);
  const [targetAmountInput, setTargetAmountInput] = useState('');
  const [initialDepositInput, setInitialDepositInput] = useState('');
  const [activeTab, setActiveTab] = useState('dashboard');
  
  // Validator stats
  const [validatorStats, setValidatorStats] = useState({
    validators: 0,
    nextValidatorIn: '32',
    progress: 0,
    pendingETH: '0',
    donors: 0,
    totalDonations: '0'
  });

  // OOOWEEE to ETH conversion rate (example: 1 OOOWEEE = 0.00001 ETH)
  const OOOWEEE_TO_ETH = 0.00001;

  // Initialize Web3Modal
  useEffect(() => {
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    
    const modal = new Web3Modal({
      network: "sepolia",
      cacheProvider: false,
      providerOptions,
      disableInjectedProvider: false,
      theme: {
        background: "rgb(39, 49, 56)",
        main: "rgb(199, 199, 199)",
        secondary: "rgb(136, 136, 136)",
        border: "rgba(195, 195, 195, 0.14)",
        hover: "rgb(16, 26, 32)"
      }
    });
    
    if (isMobile && modal.cachedProvider) {
      modal.clearCachedProvider();
    }
    
    setWeb3Modal(modal);
  }, []);

  // Loading screen
  useEffect(() => {
    setTimeout(() => setIsAppLoading(false), 2000);
  }, []);

  // Fetch ETH price
  useEffect(() => {
    fetchEthPrice();
    const interval = setInterval(fetchEthPrice, 60000);
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

  const loadValidatorStats = useCallback(async () => {
    try {
      const stats = await validatorsContract.getStats();
      const ethNeeded = await validatorsContract.ethUntilNextValidator();
      const [progress] = await validatorsContract.progressToNextValidator();
      
      setValidatorStats({
        validators: stats[0].toString(),
        nextValidatorIn: ethers.utils.formatEther(ethNeeded),
        progress: (parseFloat(ethers.utils.formatEther(progress)) / 32) * 100,
        pendingETH: ethers.utils.formatEther(stats[1]),
        totalDonations: ethers.utils.formatEther(stats[4]),
        donors: stats[5].toString()
      });
    } catch (error) {
      console.error('Error loading validator stats:', error);
    }
  }, [validatorsContract]);

  // Load validator stats
  useEffect(() => {
    if (validatorsContract) {
      loadValidatorStats();
      const interval = setInterval(loadValidatorStats, 10000);
      return () => clearInterval(interval);
    }
  }, [validatorsContract, loadValidatorStats]);

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

  // Connect Wallet (keeping your existing implementation)
  const connectWallet = async () => {
    try {
      const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
      const isWalletBrowser = typeof window.ethereum !== 'undefined';
      
      // Mobile wallet browser - connect directly
      if (isMobile && isWalletBrowser) {
        const accounts = await window.ethereum.request({
          method: 'eth_requestAccounts'
        });
        
        if (accounts.length > 0) {
          const provider = new ethers.providers.Web3Provider(window.ethereum);
          const signer = provider.getSigner();
          const address = await signer.getAddress();
          
          // Check network
          const network = await provider.getNetwork();
          if (network.chainId !== 11155111) {
            try {
              await window.ethereum.request({
                method: 'wallet_switchEthereumChain',
                params: [{ chainId: '0xaa36a7' }],
              });
            } catch (switchError) {
              if (switchError.code === 4902) {
                await window.ethereum.request({
                  method: 'wallet_addEthereumChain',
                  params: [{
                    chainId: '0xaa36a7',
                    chainName: 'Sepolia',
                    nativeCurrency: {
                      name: 'Sepolia ETH',
                      symbol: 'SEP',
                      decimals: 18
                    },
                    rpcUrls: ['https://sepolia.infura.io/v3/9aa3d95b3bc440fa88ea12eaa4456161'],
                    blockExplorerUrls: ['https://sepolia.etherscan.io']
                  }]
                });
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

          const validatorsContract = new ethers.Contract(
            CONTRACT_ADDRESSES.validators,
            OOOWEEE_VALIDATORS_ABI,
            signer
          );
          
          setAccount(address);
          setProvider(provider);
          setTokenContract(tokenContract);
          setSavingsContract(savingsContract);
          setValidatorsContract(validatorsContract);
          
          toast.success('Wallet connected! OOOWEEE!');
          
          loadBalances(address, provider, tokenContract);
          loadSavingsAccounts(address, savingsContract);
          
          window.ethereum.on("accountsChanged", (accounts) => {
            if (accounts.length === 0) {
              disconnectWallet();
            } else {
              window.location.reload();
            }
          });
          
          window.ethereum.on("chainChanged", () => {
            window.location.reload();
          });
          
          return;
        }
      }
      
      // Desktop - use Web3Modal (your existing code)
      if (!isMobile) {
        if (web3Modal && web3Modal.cachedProvider) {
          web3Modal.clearCachedProvider();
        }
        
        const instance = await web3Modal.connect();
        const provider = new ethers.providers.Web3Provider(instance);
        const signer = provider.getSigner();
        const address = await signer.getAddress();
        
        const network = await provider.getNetwork();
        if (network.chainId !== 11155111) {
          try {
            await instance.request({
              method: 'wallet_switchEthereumChain',
              params: [{ chainId: '0xaa36a7' }],
            });
          } catch (switchError) {
            if (switchError.code === 4902) {
              await instance.request({
                method: 'wallet_addEthereumChain',
                params: [{
                  chainId: '0xaa36a7',
                  chainName: 'Sepolia',
                  nativeCurrency: {
                    name: 'Sepolia ETH',
                    symbol: 'SEP',
                    decimals: 18
                  },
                  rpcUrls: ['https://sepolia.infura.io/v3/9aa3d95b3bc440fa88ea12eaa4456161'],
                  blockExplorerUrls: ['https://sepolia.etherscan.io']
                }]
              });
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

        const validatorsContract = new ethers.Contract(
          CONTRACT_ADDRESSES.validators,
          OOOWEEE_VALIDATORS_ABI,
          signer
        );

        setAccount(address);
        setProvider(provider);
        setTokenContract(tokenContract);
        setSavingsContract(savingsContract);
        setValidatorsContract(validatorsContract);
        
        toast.success('Wallet connected! OOOWEEE!');
        
        loadBalances(address, provider, tokenContract);
        loadSavingsAccounts(address, savingsContract);
        
        instance.on("accountsChanged", (accounts) => {
          if (accounts.length === 0) {
            disconnectWallet();
          } else {
            window.location.reload();
          }
        });

        instance.on("chainChanged", () => {
          window.location.reload();
        });
      }
      
    } catch (error) {
      console.error('Wallet connection error:', error);
      toast.error(error.message?.includes('User rejected') ? 
        'Connection cancelled' : 
        'Failed to connect wallet'
      );
    }
  };

  // Donate to validators
  const donateToValidators = async () => {
    const amount = prompt("How much ETH would you like to donate to bootstrap validators?");
    if (amount && parseFloat(amount) >= 0.001) {
      try {
        setLoading(true);
        const tx = await validatorsContract.donate({
          value: ethers.utils.parseEther(amount)
        });
        
        await toast.promise(
          tx.wait(),
          {
            loading: '💎 Sending donation...',
            success: `🎉 Thank you! Donated ${amount} ETH to validators!`,
            error: '❌ Donation failed'
          }
        );
        
        await loadValidatorStats();
      } catch (error) {
        console.error(error);
        if (error.code === 'ACTION_REJECTED') {
          toast.error('Transaction cancelled');
        } else {
          toast.error('Donation failed');
        }
      } finally {
        setLoading(false);
      }
    }
  };

  // Disconnect wallet
  const disconnectWallet = async () => {
    if (web3Modal) {
      web3Modal.clearCachedProvider();
    }
    
    if (window.ethereum) {
      window.ethereum.removeAllListeners('accountsChanged');
      window.ethereum.removeAllListeners('chainChanged');
    }
    
    setAccount(null);
    setProvider(null);
    setTokenContract(null);
    setSavingsContract(null);
    setValidatorsContract(null);
    setBalance('0');
    setAccounts([]);
  };

  // [Keep all your existing functions: loadBalances, loadSavingsAccounts, create accounts, etc.]
  // ... (I'm skipping these since they're unchanged from your original code)

  const loadBalances = async (account, provider, tokenContract) => {
    try {
      const tokenBal = await tokenContract.balanceOf(account);
      setBalance(ethers.utils.formatUnits(tokenBal, 18));
    } catch (error) {
      console.error('Error loading balances:', error);
    }
  };

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
          pendingRewards: ethers.utils.formatUnits(info[8], 18)
        });
      }
      
      setAccounts(accountDetails);
    } catch (error) {
      console.error('Error loading accounts:', error);
    }
  };

  const createTimeAccount = async (unlockDate, goalName, initialDeposit) => {
    try {
      setLoading(true);
      const unlockTime = Math.floor(new Date(unlockDate).getTime() / 1000);
      const depositAmount = ethers.utils.parseUnits(initialDeposit.toString(), 18);
      
      const approveTx = await tokenContract.approve(CONTRACT_ADDRESSES.savings, depositAmount);
      
      await toast.promise(
        approveTx.wait(),
        {
          loading: '🔓 Approving tokens...',
          success: '✅ Tokens approved!',
          error: '❌ Failed to approve'
        }
      );
      
      const createTx = await savingsContract.createTimeAccount(unlockTime, goalName, depositAmount);
      
      await toast.promise(
        createTx.wait(),
        {
          loading: '🐷 Creating piggy bank...',
          success: `🎉 Time account created with ${initialDeposit} $OOOWEEE! (1% fee applied)`,
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

  const createGrowthAccount = async (targetAmountEur, goalName, initialDeposit) => {
    try {
      setLoading(true);
      const targetOooweee = convertEurToOooweee(targetAmountEur);
      const target = ethers.utils.parseUnits(targetOooweee.toString(), 18);
      const depositAmount = ethers.utils.parseUnits(initialDeposit.toString(), 18);
      
      const approveTx = await tokenContract.approve(CONTRACT_ADDRESSES.savings, depositAmount);
      
      await toast.promise(
        approveTx.wait(),
        {
          loading: '🔓 Approving tokens...',
          success: '✅ Tokens approved!',
          error: '❌ Failed to approve'
        }
      );
      
      const createTx = await savingsContract.createGrowthAccount(target, goalName, depositAmount);
      
      await toast.promise(
        createTx.wait(),
        {
          loading: '🌱 Planting seed...',
          success: `🌳 Growth account created with ${initialDeposit} $OOOWEEE! (1% fee applied)`,
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

  const createBalanceAccount = async (targetAmountEur, recipientAddress, goalName, initialDeposit) => {
    try {
      setLoading(true);
      const targetOooweee = convertEurToOooweee(targetAmountEur);
      const target = ethers.utils.parseUnits(targetOooweee.toString(), 18);
      const depositAmount = ethers.utils.parseUnits(initialDeposit.toString(), 18);
      
      if (!ethers.utils.isAddress(recipientAddress)) {
        toast.error('Invalid recipient address');
        return;
      }
      
      const approveTx = await tokenContract.approve(CONTRACT_ADDRESSES.savings, depositAmount);
      
      await toast.promise(
        approveTx.wait(),
        {
          loading: '🔓 Approving tokens...',
          success: '✅ Tokens approved!',
          error: '❌ Failed to approve'
        }
      );
      
      const createTx = await savingsContract.createBalanceAccount(target, recipientAddress, goalName, depositAmount);
      
      await toast.promise(
        createTx.wait(),
        {
          loading: '⚖️ Setting up scale...',
          success: `💸 Balance account created with ${initialDeposit} $OOOWEEE! (1% fee applied)`,
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

  const handleCreateAccount = () => {
    const goalName = document.getElementById('goalName').value;
    const initialDeposit = document.getElementById('initialDeposit').value;
    
    if (!goalName) {
      toast.error('Please enter a goal name');
      return;
    }
    
    if (!initialDeposit || parseFloat(initialDeposit) <= 0) {
      toast.error('Please enter an initial deposit amount (any amount > 0)');
      return;
    }
    
    if (accountType === 'time') {
      const unlockDate = document.getElementById('unlockDate').value;
      if (!unlockDate) {
        toast.error('Please select an unlock date');
        return;
      }
      createTimeAccount(unlockDate, goalName, initialDeposit);
    } else if (accountType === 'growth') {
      const targetAmount = document.getElementById('targetAmount').value;
      if (!targetAmount || targetAmount <= 0) {
        toast.error('Please enter a valid target amount');
        return;
      }
      createGrowthAccount(targetAmount, goalName, initialDeposit);
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
      createBalanceAccount(targetAmount, recipientAddress, goalName, initialDeposit);
    }
  };

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

  // About page content
  const renderAboutPage = () => (
    <div className="about-page">
      <div className="about-hero">
        <img src={oooweeLogo} alt="OOOWEEE" className="about-logo pixel-art" />
        <h1>The OOOWEEE Protocol</h1>
        <p className="tagline">Financial Freedom Through Protected Savings</p>
      </div>

      <div className="vision-section">
        <h2>💭 Founder's Vision</h2>
        <div className="vision-card">
          <p className="vision-text">
            Today's world bombards us with advertisements designed to separate us from our money. 
            Every scroll, every click, every moment online is filled with temptations to spend on 
            things we don't need. This constant marketing assault is the invisible barrier keeping 
            people from climbing the financial ladder.
          </p>
          <p className="vision-text">
            <strong>You are your own worst enemy when it comes to financial independence.</strong> 
            That's why we built OOOWEEE - a protocol that makes your savings truly untouchable, 
            even by yourself. No compromise. No exceptions. Your future self will thank you.
          </p>
          <p className="vision-text">
            We're creating a shield against the ultra-invasive nature of modern marketing. 
            A tool that gives you the power to fight back against impulse spending and build 
            real wealth, one locked savings account at a time.
          </p>
        </div>
      </div>

      <div className="how-it-works">
        <h2>⚙️ How It Works</h2>
        
        <div className="feature-grid">
          <div className="feature-card">
            <span className="feature-icon">🔒</span>
            <h3>Smart Contract Savings</h3>
            <p>Your savings are locked in immutable smart contracts on Ethereum. Once created, 
            not even you can break your commitment. True financial discipline enforced by code.</p>
          </div>

          <div className="feature-card">
            <span className="feature-icon">🛡️</span>
            <h3>SSA Protection</h3>
            <p>The Speculative Spike Absorber (SSA) captures value from price pumps and converts 
            it to stable ETH for validator creation. This protects savers from speculation while 
            building long-term value.</p>
          </div>

          <div className="feature-card">
            <span className="feature-icon">🎯</span>
            <h3>Three Account Types</h3>
            <ul>
              <li><strong>Time Accounts:</strong> Lock until a specific date</li>
              <li><strong>Growth Accounts:</strong> Auto-unlock at target amount</li>
              <li><strong>Balance Accounts:</strong> Auto-send to recipient at target</li>
            </ul>
          </div>

          <div className="feature-card">
            <span className="feature-icon">🔄</span>
            <h3>Circular Economy</h3>
            <p>Price spikes fund validators → Validators earn rewards → 33% to savers, 
            33% to operations, 34% to next validator. Continuous value creation long after 
            all 100M tokens are in circulation.</p>
          </div>

          <div className="feature-card">
            <span className="feature-icon">💎</span>
            <h3>Validator Network</h3>
            <p>Community-funded Ethereum validators generate sustainable rewards. Every 32 ETH 
            accumulated creates a new validator, compounding returns for all savers.</p>
          </div>

          <div className="feature-card">
            <span className="feature-icon">🌍</span>
            <h3>True Decentralization</h3>
            <p>Built on Ethereum mainnet, not Layer 2s. Your funds are truly decentralized 
            with no central authority able to freeze or confiscate them.</p>
          </div>
        </div>
      </div>

      <div className="tokenomics-section">
        <h2>📊 Tokenomics</h2>
        <div className="tokenomics-grid">
          <div className="token-stat">
            <h4>Total Supply</h4>
            <p>100,000,000 $OOOWEEE</p>
          </div>
          <div className="token-stat">
            <h4>Stability Reserve</h4>
            <p>89,000,000 (89%)</p>
          </div>
          <div className="token-stat">
            <h4>Founder Allocation</h4>
            <p>10,000,000 (10%)</p>
          </div>
          <div className="token-stat">
            <h4>Initial Liquidity</h4>
            <p>1,000,000 (1%)</p>
          </div>
        </div>
      </div>

      <div className="cta-section">
        <h2>🚀 Join the Revolution</h2>
        <p>Take control of your financial future. Start saving with OOOWEEE today.</p>
        <button 
          onClick={() => setActiveTab('dashboard')} 
          className="cta-button rainbow-btn"
        >
          Start Saving Now
        </button>
      </div>
    </div>
  );

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
        {/* Tab Navigation */}
        <div className="tab-navigation">
          <button 
            className={`tab-btn ${activeTab === 'dashboard' ? 'active' : ''}`}
            onClick={() => setActiveTab('dashboard')}
          >
            🎮 Dashboard
          </button>
          <button 
            className={`tab-btn ${activeTab === 'about' ? 'active' : ''}`}
            onClick={() => setActiveTab('about')}
          >
            📖 About
          </button>
        </div>

        {activeTab === 'about' ? (
          renderAboutPage()
        ) : (
          <>
            <div className="hero-section">
              <img 
                src={oooweeLogo} 
                alt="OOOWEEE" 
                className="main-logo pixel-art"
              />
              <p className="tagline">OOOWEEE! Make your $aving goals non-negotiable!</p>
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

                  {/* Validator Card */}
                  <div className="validator-card">
                    <div className="validator-header">
                      <h3>🔐 Validator Network</h3>
                    </div>
                    
                    <div className="stats-grid">
                      <div className="stat">
                        <span className="label">Active Validators</span>
                        <span className="value">{validatorStats.validators}</span>
                      </div>
                      
                      <div className="stat">
                        <span className="label">Next Validator In</span>
                        <span className="value">{parseFloat(validatorStats.nextValidatorIn).toFixed(2)} ETH</span>
                      </div>
                    </div>
                    
                    <div className="progress-bar">
                      <div 
                        className="progress-fill rainbow-fill" 
                        style={{ width: `${validatorStats.progress}%` }}
                      />
                      <span className="progress-text">
                        {(32 - parseFloat(validatorStats.nextValidatorIn)).toFixed(2)} / 32 ETH
                      </span>
                    </div>
                    
                    <div className="donation-info">
                      <p>🤝 {validatorStats.donors} donors contributed {parseFloat(validatorStats.totalDonations).toFixed(3)} ETH</p>
                    </div>
                    
                    <button 
                      className="donate-btn rainbow-btn"
                      onClick={donateToValidators}
                      disabled={loading}
                    >
                      💎 Donate ETH to Bootstrap Validators
                    </button>
                    
                    <p className="help-text">
                      Help launch validators to earn rewards for all OOOWEEE savers!
                    </p>
                  </div>
                </div>
                
                {/* Rest of your existing dashboard content */}
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
                                {parseFloat(acc.pendingRewards) > 0 && (
                                  <div className="detail-row rewards">
                                    <span>Pending Rewards:</span>
                                    <span className="value">+{parseFloat(acc.pendingRewards).toFixed(2)} $OOOWEEE</span>
                                  </div>
                                )}
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
                            </div>
                            
                            <div className="deposit-section">
                              <input 
                                type="number" 
                                placeholder="Amount to deposit"
                                id={`deposit-${acc.id}`}
                                min="0.001"
                                step="0.001"
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
                  
                  <div className="form-group">
                    <input 
                      type="number" 
                      placeholder="Initial deposit $OOOWEEE (any amount > 0)" 
                      id="initialDeposit"
                      min="0.001"
                      step="0.001"
                      value={initialDepositInput}
                      onChange={(e) => setInitialDepositInput(e.target.value)}
                      className="number-input"
                    />
                    <p className="fee-note">
                      💡 1% creation fee from initial deposit
                    </p>
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
                </div>
              </div>
            )}
          </>
        )}
      </header>
    </div>
  );
}

export default App;