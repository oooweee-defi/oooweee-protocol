import React, { useState, useEffect, useCallback } from 'react';
import { ethers } from 'ethers';
import toast, { Toaster } from 'react-hot-toast';
import './App.css';
import oooweeLogo from './assets/oooweee-logo.png';
import { OOOWEEETokenABI, OOOWEEESavingsABI, OOOWEEEValidatorFundABI, OOOWEEEStabilityABI, CONTRACT_ADDRESSES } from './contracts/abis';
import Web3Modal from "web3modal";
import WalletConnectProvider from "@walletconnect/web3-provider";

// Uniswap Router ABI (minimal) - added getAmountsIn and swapETHForExactTokens
const UNISWAP_ROUTER_ABI = [
  "function swapExactETHForTokens(uint amountOutMin, address[] calldata path, address to, uint deadline) external payable returns (uint[] memory amounts)",
  "function swapETHForExactTokens(uint amountOut, address[] calldata path, address to, uint deadline) external payable returns (uint[] memory amounts)",
  "function getAmountsOut(uint amountIn, address[] calldata path) public view returns (uint[] memory amounts)",
  "function getAmountsIn(uint amountOut, address[] calldata path) public view returns (uint[] memory amounts)",
  "function WETH() external pure returns (address)"
];

// Contract addresses
const UNISWAP_ROUTER = "0xC532a74256D3Db42D0Bf7a0400fEFDbad7694008";
const WETH_ADDRESS = "0x7b79995e5f793A07Bc00c21412e50Ecae098E7f9";

// ADMIN WALLET - Update this to your operations wallet address
const ADMIN_WALLET = "0x335bB9E071F10a414308170045A5Bc614BcC97B6";

// Minimum deposit in EUR (cents) - matches contract default
const MINIMUM_DEPOSIT_EUR_CENTS = 1000; // €10

// Currency configuration
const CURRENCIES = {
  USD: { code: 0, symbol: '$', name: 'US Dollar', decimals: 2, locale: 'en-US' },
  EUR: { code: 1, symbol: '€', name: 'Euro', decimals: 2, locale: 'en-IE' },
  GBP: { code: 2, symbol: '£', name: 'British Pound', decimals: 2, locale: 'en-GB' },
  JPY: { code: 3, symbol: '¥', name: 'Japanese Yen', decimals: 0, locale: 'ja-JP' },
  CNY: { code: 4, symbol: '¥', name: 'Chinese Yuan', decimals: 2, locale: 'zh-CN' },
  CAD: { code: 5, symbol: 'C$', name: 'Canadian Dollar', decimals: 2, locale: 'en-CA' },
  AUD: { code: 6, symbol: 'A$', name: 'Australian Dollar', decimals: 2, locale: 'en-AU' },
  CHF: { code: 7, symbol: 'CHF', name: 'Swiss Franc', decimals: 2, locale: 'de-CH' },
  INR: { code: 8, symbol: '₹', name: 'Indian Rupee', decimals: 2, locale: 'en-IN' },
  KRW: { code: 9, symbol: '₩', name: 'Korean Won', decimals: 0, locale: 'ko-KR' }
};

// Web3Modal provider options
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
        mobileLinks: ["metamask", "trust", "rainbow", "argent", "imtoken", "pillar", "coinbase"]
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
  const [validatorFundContract, setValidatorFundContract] = useState(null);
  const [stabilityContract, setStabilityContract] = useState(null);
  const [routerContract, setRouterContract] = useState(null);
  const [balance, setBalance] = useState('0');
  const [ethBalance, setEthBalance] = useState('0');
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
  const [showBuyModal, setShowBuyModal] = useState(false);
  const [ethToBuy, setEthToBuy] = useState('0.01');
  const [estimatedOooweee, setEstimatedOooweee] = useState('0');
  const [accountCurrency, setAccountCurrency] = useState('EUR');
  const [isConnecting, setIsConnecting] = useState(false);
  const [requiredOooweeeForPurchase, setRequiredOooweeeForPurchase] = useState(null);
  const [buyMode, setBuyMode] = useState('eth'); // 'eth' or 'exact'
  
  // Validator stats
  const [validatorStats, setValidatorStats] = useState({
    validators: 0,
    nextValidatorIn: '32',
    progress: 0,
    pendingETH: '0',
    totalDonations: '0',
    donors: 0,
    fromStability: '0',
    fromRewards: '0'
  });
  
  // Price tracking
  const [oooweeePrice, setOooweeePrice] = useState(0.00001);
  
  // Admin Dashboard State
  const [adminStats, setAdminStats] = useState({
    totalValueLocked: '0',
    totalAccountsCreated: 0,
    totalGoalsCompleted: 0,
    totalFeesCollected: '0',
    totalRewardsDistributed: '0',
    totalActiveBalance: '0',
    currentPrice: '0',
    baselinePrice: '0',
    tokenBalance: '0',
    interventionsToday: 0,
    totalInterventions: 0,
    tokensUsedToday: '0',
    totalTokensUsed: '0',
    totalETHCaptured: '0',
    totalETHSentToValidators: '0',
    circuitBreakerTripped: false,
    systemChecksEnabled: true,
    marketHighVolatility: false,
    blockNumber: 0,
    lastBlockTime: 0,
    isSequencerHealthy: true,
    isPriceOracleHealthy: true,
    priceIncreasePercent: 0
  });
  
  // Admin refresh interval
  useEffect(() => {
    if (account?.toLowerCase() === ADMIN_WALLET.toLowerCase() && activeTab === 'admin') {
      loadAdminStats();
      const interval = setInterval(loadAdminStats, 5000);
      return () => clearInterval(interval);
    }
  }, [account, activeTab, stabilityContract, savingsContract, provider]);
  
  // Load admin statistics
  const loadAdminStats = useCallback(async () => {
    if (!stabilityContract || !savingsContract || !provider) return;
    
    try {
      const [stabilityInfo, marketConditions, circuitBreaker, statsView, blockNumber] = await Promise.all([
        stabilityContract.getStabilityInfo(),
        stabilityContract.getMarketConditions(),
        stabilityContract.getCircuitBreakerStatus(),
        savingsContract.getStatsView(),
        provider.getBlockNumber()
      ]);
      
      const block = await provider.getBlock(blockNumber);
      
      setAdminStats({
        totalValueLocked: ethers.utils.formatUnits(statsView[0], 18),
        totalAccountsCreated: statsView[1].toNumber(),
        totalGoalsCompleted: statsView[2].toNumber(),
        totalActiveBalance: ethers.utils.formatUnits(statsView[3], 18),
        totalRewardsDistributed: ethers.utils.formatUnits(statsView[4], 18),
        totalFeesCollected: ethers.utils.formatUnits(statsView[5], 18),
        currentPrice: ethers.utils.formatUnits(stabilityInfo[0], 18),
        baselinePrice: ethers.utils.formatUnits(stabilityInfo[6], 18),
        tokenBalance: ethers.utils.formatUnits(stabilityInfo[1], 18),
        totalInterventions: stabilityInfo[2].toNumber(),
        totalTokensUsed: ethers.utils.formatUnits(stabilityInfo[3], 18),
        totalETHCaptured: ethers.utils.formatUnits(stabilityInfo[4], 18),
        totalETHSentToValidators: ethers.utils.formatUnits(stabilityInfo[5], 18),
        priceIncreasePercent: stabilityInfo[7].toNumber(),
        circuitBreakerTripped: circuitBreaker[0],
        interventionsToday: circuitBreaker[1].toNumber(),
        tokensUsedToday: ethers.utils.formatUnits(circuitBreaker[2], 18),
        marketHighVolatility: marketConditions[0],
        currentCheckInterval: marketConditions[1].toNumber(),
        blocksSinceLastSpike: marketConditions[2].toNumber(),
        dailyInterventionCount: marketConditions[3].toNumber(),
        blockNumber: blockNumber,
        lastBlockTime: block.timestamp,
        isSequencerHealthy: true,
        isPriceOracleHealthy: stabilityInfo[0].gt(0)
      });
    } catch (error) {
      console.error('Error loading admin stats:', error);
    }
  }, [stabilityContract, savingsContract, provider]);
  
  // Admin functions
  const resetCircuitBreaker = async () => {
    try {
      setLoading(true);
      const tx = await stabilityContract.resetCircuitBreaker();
      await toast.promise(tx.wait(), {
        loading: '🔧 Resetting circuit breaker...',
        success: '✅ Circuit breaker reset!',
        error: '❌ Failed to reset'
      });
      await loadAdminStats();
    } catch (error) {
      console.error(error);
      toast.error('Failed to reset circuit breaker');
    } finally {
      setLoading(false);
    }
  };
  
  const toggleSystemChecks = async () => {
    try {
      setLoading(true);
      const tx = await stabilityContract.toggleSystemChecks();
      await toast.promise(tx.wait(), {
        loading: '🔧 Toggling system checks...',
        success: '✅ System checks toggled!',
        error: '❌ Failed to toggle'
      });
      await loadAdminStats();
    } catch (error) {
      console.error(error);
      toast.error('Failed to toggle system checks');
    } finally {
      setLoading(false);
    }
  };
  
  const manualStabilityCheck = async () => {
    try {
      setLoading(true);
      const tx = await stabilityContract.manualStabilityCheck({
        value: ethers.utils.parseEther("0.01")
      });
      await toast.promise(tx.wait(), {
        loading: '🔍 Running stability check...',
        success: '✅ Stability check complete!',
        error: '❌ Check failed'
      });
      await loadAdminStats();
    } catch (error) {
      console.error(error);
      toast.error('Failed to run stability check: ' + (error.reason || error.message));
    } finally {
      setLoading(false);
    }
  };
  
  const updateBaselinePrice = async () => {
    try {
      setLoading(true);
      const tx = await stabilityContract.updateBaselinePrice();
      await toast.promise(tx.wait(), {
        loading: '📊 Updating baseline price...',
        success: '✅ Baseline price updated!',
        error: '❌ Failed to update baseline'
      });
      await loadAdminStats();
    } catch (error) {
      console.error(error);
      toast.error('Failed to update baseline: ' + (error.reason || error.message));
    } finally {
      setLoading(false);
    }
  };
  
  const triggerSystemCheck = async () => {
    try {
      setLoading(true);
      const tx = await stabilityContract.systemStabilityCheck();
      await toast.promise(tx.wait(), {
        loading: '⚡ Triggering system stability check...',
        success: '✅ System check triggered!',
        error: '❌ Check failed'
      });
      await loadAdminStats();
    } catch (error) {
      console.error(error);
      toast.error('Failed to trigger system check: ' + (error.reason || error.message));
    } finally {
      setLoading(false);
    }
  };
  
  // Initialize on load
  useEffect(() => {
    const init = async () => {
      setIsAppLoading(true);
      
      const web3ModalInstance = new Web3Modal({
        cacheProvider: true,
        providerOptions
      });
      
      setWeb3Modal(web3ModalInstance);
      
      try {
        const response = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd,eur,gbp,jpy,cny,cad,aud,chf,inr,krw');
        const data = await response.json();
        setEthPrice(data.ethereum);
      } catch (error) {
        console.error('Error fetching ETH price:', error);
        setEthPrice({ usd: 2000, eur: 1850, gbp: 1600, jpy: 280000, cny: 14000, cad: 2600, aud: 3000, chf: 1800, inr: 165000, krw: 2600000 });
      }
      
      setTimeout(() => setIsAppLoading(false), 1500);
    };
    
    init();
  }, []);

  // Auto-reconnect wallet if cached - FIX: Prevent multiple connections
  useEffect(() => {
    if (web3Modal && web3Modal.cachedProvider && !account && !isConnecting) {
      connectWallet();
    }
  }, [web3Modal]);
  
  // Format currency
  const formatCurrency = (amount, currency = 'eur') => {
    const curr = Object.entries(CURRENCIES).find(([key, _]) => key.toLowerCase() === currency.toLowerCase()) || ['EUR', CURRENCIES.EUR];
    return new Intl.NumberFormat(curr[1].locale, {
      style: 'currency',
      currency: curr[0],
      minimumFractionDigits: curr[1].decimals,
      maximumFractionDigits: curr[1].decimals
    }).format(amount);
  };

  // Update OOOWEEE price
  const updateOooweeePrice = useCallback(async () => {
    if (!routerContract) return;
    
    try {
      const ethAmount = ethers.utils.parseEther("1");
      const path = [WETH_ADDRESS, CONTRACT_ADDRESSES.OOOWEEEToken];
      const amounts = await routerContract.getAmountsOut(ethAmount, path);
      const oooweeePerEth = parseFloat(ethers.utils.formatUnits(amounts[1], 18));
      setOooweeePrice(1 / oooweeePerEth);
    } catch (error) {
      console.error('Error fetching OOOWEEE price:', error);
    }
  }, [routerContract]);

  // Update price periodically
  useEffect(() => {
    if (routerContract) {
      updateOooweeePrice();
      const interval = setInterval(updateOooweeePrice, 30000);
      return () => clearInterval(interval);
    }
  }, [routerContract, updateOooweeePrice]);

  // Estimate OOOWEEE output for ETH input
  useEffect(() => {
    const estimateOooweee = async () => {
      if (!routerContract || !ethToBuy || parseFloat(ethToBuy) <= 0) {
        setEstimatedOooweee('0');
        return;
      }
      
      try {
        const ethAmount = ethers.utils.parseEther(ethToBuy);
        const path = [WETH_ADDRESS, CONTRACT_ADDRESSES.OOOWEEEToken];
        const amounts = await routerContract.getAmountsOut(ethAmount, path);
        setEstimatedOooweee(ethers.utils.formatUnits(amounts[1], 18));
      } catch (error) {
        setEstimatedOooweee('0');
      }
    };
    
    estimateOooweee();
  }, [ethToBuy, routerContract]);

  // Calculate ETH needed for exact OOOWEEE amount
  const calculateEthForExactOooweee = useCallback(async (oooweeeAmount) => {
    if (!routerContract || !oooweeeAmount || parseFloat(oooweeeAmount) <= 0) {
      return null;
    }
    
    try {
      const tokensNeeded = ethers.utils.parseUnits(Math.ceil(oooweeeAmount).toString(), 18);
      const path = [WETH_ADDRESS, CONTRACT_ADDRESSES.OOOWEEEToken];
      const amountsIn = await routerContract.getAmountsIn(tokensNeeded, path);
      // Add 3% buffer for price movement
      const ethNeeded = amountsIn[0].mul(103).div(100);
      return ethers.utils.formatEther(ethNeeded);
    } catch (error) {
      console.error('Error calculating ETH needed:', error);
      return null;
    }
  }, [routerContract]);

  // Load validator stats - with error handling
  const loadValidatorStats = useCallback(async () => {
    if (!validatorFundContract) return;
    
    try {
      const [stats, ethNeeded, progressData] = await Promise.all([
        validatorFundContract.getStats(),
        validatorFundContract.ethUntilNextValidator(),
        validatorFundContract.progressToNextValidator()
      ]);
      
      let totalRewards = ethers.BigNumber.from(0);
      try {
        totalRewards = await validatorFundContract.totalValidatorRewards();
      } catch (e) {
        // totalValidatorRewards might not be accessible
      }

      const totalETHReceived = stats[3];
      const totalDonations = stats[4];
      const fromStability = totalETHReceived.sub(totalDonations);
      
      setValidatorStats({
        validators: stats[0].toString(),
        nextValidatorIn: ethers.utils.formatEther(ethNeeded),
        progress: (parseFloat(ethers.utils.formatEther(progressData[0])) / 32) * 100,
        pendingETH: ethers.utils.formatEther(stats[1]),
        totalDonations: ethers.utils.formatEther(totalDonations),
        donors: stats[5].toString(),
        fromStability: ethers.utils.formatEther(fromStability),
        fromRewards: ethers.utils.formatEther(totalRewards)
      });
    } catch (error) {
      console.error('Error loading validator stats:', error);
    }
  }, [validatorFundContract]);

  // Load validator stats
  useEffect(() => {
    if (validatorFundContract) {
      loadValidatorStats();
      const interval = setInterval(loadValidatorStats, 10000);
      return () => clearInterval(interval);
    }
  }, [validatorFundContract, loadValidatorStats]);

  // Calculate fiat value
  const getOooweeeInFiat = (oooweeeAmount, currency = 'eur') => {
    if (!ethPrice) return '...';
    const ethValue = parseFloat(oooweeeAmount) * oooweeePrice;
    const fiatValue = ethValue * (ethPrice[currency.toLowerCase()] || ethPrice.eur);
    return formatCurrency(fiatValue, currency);
  };

  // Convert fiat to OOOWEEE amount
  const convertFiatToOooweee = (fiatAmount, currency = 'eur') => {
    if (!ethPrice || !fiatAmount) return 0;
    const ethValue = parseFloat(fiatAmount) / (ethPrice[currency.toLowerCase()] || ethPrice.eur);
    const oooweeeAmount = ethValue / oooweeePrice;
    return Math.floor(oooweeeAmount);
  };

  // Convert OOOWEEE to fiat
  const convertOooweeeToFiat = (oooweeeAmount, currency = 'eur') => {
    if (!ethPrice || !oooweeeAmount) return 0;
    const ethValue = parseFloat(oooweeeAmount) * oooweeePrice;
    return ethValue * (ethPrice[currency.toLowerCase()] || ethPrice.eur);
  };

  // Get minimum deposit in current currency
  const getMinimumDepositInCurrency = (currency = 'eur') => {
    if (!ethPrice) return 10; // Default €10
    const eurPrice = ethPrice.eur || 1850;
    const targetPrice = ethPrice[currency.toLowerCase()] || eurPrice;
    // Convert €10 to target currency
    return (10 * targetPrice) / eurPrice;
  };

  // Check if deposit meets minimum
  const checkMinimumDeposit = (oooweeeAmount) => {
    const fiatValue = convertOooweeeToFiat(oooweeeAmount, 'eur');
    return fiatValue >= 10; // €10 minimum
  };

  // Buy OOOWEEE with ETH (standard mode - specify ETH amount)
  const buyOooweee = async () => {
    if (!ethToBuy || parseFloat(ethToBuy) <= 0) {
      toast.error('Enter a valid ETH amount');
      return;
    }
    
    try {
      setLoading(true);
      
      const ethAmount = ethers.utils.parseEther(ethToBuy);
      const path = [WETH_ADDRESS, CONTRACT_ADDRESSES.OOOWEEEToken];
      const deadline = Math.floor(Date.now() / 1000) + 3600;
      
      const amounts = await routerContract.getAmountsOut(ethAmount, path);
      const minOutput = amounts[1].mul(97).div(100);
      
      const tx = await routerContract.swapExactETHForTokens(
        minOutput,
        path,
        account,
        deadline,
        { value: ethAmount }
      );
      
      await toast.promise(tx.wait(), {
        loading: '🔄 Swapping ETH for OOOWEEE...',
        success: `🎉 Bought ${parseFloat(estimatedOooweee).toFixed(2)} OOOWEEE!`,
        error: '❌ Swap failed'
      });
      
      setShowBuyModal(false);
      setRequiredOooweeeForPurchase(null);
      setBuyMode('eth');
      await loadBalances(account, provider, tokenContract);
      
    } catch (error) {
      console.error(error);
      if (error.code === 'ACTION_REJECTED') {
        toast.error('Transaction cancelled');
      } else if (error.message.includes('insufficient')) {
        toast.error('Insufficient ETH balance');
      } else {
        toast.error('Swap failed');
      }
    } finally {
      setLoading(false);
    }
  };

  // Buy EXACT amount of OOOWEEE (for when user needs specific amount)
  const buyExactOooweee = async () => {
    if (!requiredOooweeeForPurchase || requiredOooweeeForPurchase <= 0) {
      toast.error('Invalid amount');
      return;
    }
    
    try {
      setLoading(true);
      
      const tokensNeeded = ethers.utils.parseUnits(Math.ceil(requiredOooweeeForPurchase).toString(), 18);
      const path = [WETH_ADDRESS, CONTRACT_ADDRESSES.OOOWEEEToken];
      const deadline = Math.floor(Date.now() / 1000) + 3600;
      
      // Get ETH needed for exact token amount
      const amountsIn = await routerContract.getAmountsIn(tokensNeeded, path);
      // Add 5% buffer for price movement
      const ethWithBuffer = amountsIn[0].mul(105).div(100);
      
      // Use swapETHForExactTokens to get EXACTLY the tokens we need
      const tx = await routerContract.swapETHForExactTokens(
        tokensNeeded,
        path,
        account,
        deadline,
        { value: ethWithBuffer }
      );
      
      await toast.promise(tx.wait(), {
        loading: `🔄 Buying exactly ${Math.ceil(requiredOooweeeForPurchase).toLocaleString()} OOOWEEE...`,
        success: `🎉 Bought ${Math.ceil(requiredOooweeeForPurchase).toLocaleString()} OOOWEEE!`,
        error: '❌ Swap failed'
      });
      
      setShowBuyModal(false);
      setRequiredOooweeeForPurchase(null);
      setBuyMode('eth');
      await loadBalances(account, provider, tokenContract);
      
    } catch (error) {
      console.error(error);
      if (error.code === 'ACTION_REJECTED') {
        toast.error('Transaction cancelled');
      } else if (error.message.includes('insufficient')) {
        toast.error('Insufficient ETH balance');
      } else {
        toast.error('Swap failed: ' + (error.reason || error.message));
      }
    } finally {
      setLoading(false);
    }
  };

  // Open buy modal with specific amount needed
  const openBuyModalWithAmount = async (neededOooweee) => {
    setRequiredOooweeeForPurchase(neededOooweee);
    setBuyMode('exact');
    
    // Calculate and set the ETH needed for display
    const ethNeeded = await calculateEthForExactOooweee(neededOooweee);
    if (ethNeeded) {
      setEthToBuy(ethNeeded);
    }
    
    setShowBuyModal(true);
  };

  // Connect wallet - FIX: Prevent duplicate connections
  const connectWallet = async () => {
    if (isConnecting) return;
    
    try {
      setIsConnecting(true);
      setLoading(true);
      
      if (!web3Modal) {
        toast.error('Web3Modal not initialized');
        return;
      }
      
      const instance = await web3Modal.connect();
      const web3Provider = new ethers.providers.Web3Provider(instance);
      const signer = web3Provider.getSigner();
      const address = await signer.getAddress();
      
      const network = await web3Provider.getNetwork();
      if (network.chainId !== 11155111) {
        toast.error('Please switch to Sepolia network');
        setLoading(false);
        setIsConnecting(false);
        return;
      }
      
      // Initialize contracts
      const token = new ethers.Contract(CONTRACT_ADDRESSES.OOOWEEEToken, OOOWEEETokenABI, signer);
      const savings = new ethers.Contract(CONTRACT_ADDRESSES.OOOWEEESavings, OOOWEEESavingsABI, signer);
      const validatorFund = new ethers.Contract(CONTRACT_ADDRESSES.OOOWEEEValidatorFund, OOOWEEEValidatorFundABI, signer);
      const stability = new ethers.Contract(CONTRACT_ADDRESSES.OOOWEEEStability, OOOWEEEStabilityABI, signer);
      const router = new ethers.Contract(UNISWAP_ROUTER, UNISWAP_ROUTER_ABI, signer);
      
      setAccount(address);
      setProvider(web3Provider);
      setTokenContract(token);
      setSavingsContract(savings);
      setValidatorFundContract(validatorFund);
      setStabilityContract(stability);
      setRouterContract(router);
      
      // Load user data (read-only operations)
      await loadBalances(address, web3Provider, token);
      await loadSavingsAccounts(address, savings, web3Provider);
      
      // Subscribe to events
      if (instance.on) {
        instance.on("accountsChanged", handleAccountsChanged);
        instance.on("chainChanged", handleChainChanged);
      }
      
      toast.success('Wallet connected!');
    } catch (error) {
      console.error(error);
      if (error.message !== 'User closed modal') {
        toast.error('Failed to connect wallet');
      }
    } finally {
      setLoading(false);
      setIsConnecting(false);
    }
  };

  const handleAccountsChanged = async (accounts) => {
    if (accounts.length === 0) {
      disconnectWallet();
    } else {
      window.location.reload();
    }
  };

  const handleChainChanged = (chainId) => {
    window.location.reload();
  };

  const donateToValidators = async () => {
    const amount = prompt('Enter ETH amount to donate:');
    if (amount && parseFloat(amount) > 0) {
      try {
        setLoading(true);
        const tx = await validatorFundContract.donate({ 
          value: ethers.utils.parseEther(amount) 
        });
        
        await toast.promise(tx.wait(), {
          loading: '💰 Sending donation...',
          success: `🎉 Donated ${amount} ETH to validator fund!`,
          error: '❌ Donation failed'
        });
        
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
    setValidatorFundContract(null);
    setStabilityContract(null);
    setRouterContract(null);
    setBalance('0');
    setEthBalance('0');
    setAccounts([]);
  };

  const loadBalances = async (account, provider, tokenContract) => {
    try {
      const [tokenBal, ethBal] = await Promise.all([
        tokenContract.balanceOf(account),
        provider.getBalance(account)
      ]);
      
      setBalance(ethers.utils.formatUnits(tokenBal, 18));
      setEthBalance(ethers.utils.formatEther(ethBal));
    } catch (error) {
      console.error('Error loading balances:', error);
    }
  };

  // FIX: Calculate progress locally instead of calling state-changing function
  const calculateProgress = (acc, oooweeePrice, ethPrice) => {
    if (acc.type === 'Time') {
      // Time accounts: progress based on time
      const now = Math.floor(Date.now() / 1000);
      const created = acc.createdAt || now;
      const unlock = acc.unlockTime;
      if (unlock <= now) return 100;
      const total = unlock - created;
      const elapsed = now - created;
      return Math.min(100, Math.floor((elapsed / total) * 100));
    }
    
    if (acc.isFiatTarget && acc.targetFiat > 0) {
      // Calculate current fiat value from token balance
      const currencyCode = getCurrencyFromCode(acc.targetCurrency);
      const ethPriceForCurrency = ethPrice?.[currencyCode.toLowerCase()] || ethPrice?.eur || 1850;
      const tokenValueInEth = parseFloat(acc.balance) * oooweeePrice;
      const currentFiatValue = tokenValueInEth * ethPriceForCurrency;
      
      // targetFiat is in smallest units (cents)
      const targetFiatValue = acc.targetFiat / 100;
      
      if (targetFiatValue <= 0) return 0;
      return Math.min(100, Math.floor((currentFiatValue / targetFiatValue) * 100));
    }
    
    if (parseFloat(acc.target) > 0) {
      return Math.min(100, Math.floor((parseFloat(acc.balance) / parseFloat(acc.target)) * 100));
    }
    
    return 0;
  };

  const loadSavingsAccounts = async (account, savingsContract, provider) => {
    try {
      const accountIds = await savingsContract.getUserAccounts(account);
      const accountDetails = [];
      
      for (let id of accountIds) {
        try {
          const info = await savingsContract.getAccountDetails(account, id);
          
          const ACCOUNT_TYPES = ['Time', 'Balance', 'Growth'];

          const accData = {
            id: id.toString(),
            type: ACCOUNT_TYPES[info[0]],
            isActive: info[1],
            balance: ethers.utils.formatUnits(info[2], 18),
            target: ethers.utils.formatUnits(info[3], 18),
            targetFiat: info[4].toNumber(),
            targetCurrency: info[5],
            unlockTime: info[6].toNumber(),
            recipient: info[7],
            goalName: info[8],
            pendingRewards: '0',
            isFiatTarget: info[4].gt(0)
          };
          
          // Calculate progress locally
          accData.progress = calculateProgress(accData, oooweeePrice, ethPrice);
          
          // Calculate current fiat value for display
          if (accData.isFiatTarget) {
            const currencyCode = getCurrencyFromCode(accData.targetCurrency);
            const ethPriceForCurrency = ethPrice?.[currencyCode.toLowerCase()] || ethPrice?.eur || 1850;
            const tokenValueInEth = parseFloat(accData.balance) * oooweeePrice;
            accData.currentFiatValue = Math.floor(tokenValueInEth * ethPriceForCurrency * 100); // In cents
          } else {
            accData.currentFiatValue = 0;
          }
          
          accountDetails.push(accData);
        } catch (error) {
          console.error(`Error loading account ${id}:`, error);
        }
      }
      
      setAccounts(accountDetails);
    } catch (error) {
      console.error('Error loading accounts:', error);
    }
  };

  const claimRewards = async (accountId) => {
    try {
      setLoading(true);
      const tx = await savingsContract.claimRewards(accountId);
      
      await toast.promise(tx.wait(), {
        loading: '🎁 Claiming rewards...',
        success: '✅ Rewards claimed!',
        error: '❌ Failed to claim rewards'
      });
      
      await loadSavingsAccounts(account, savingsContract, provider);
      
    } catch (error) {
      console.error(error);
      toast.error('Failed to claim rewards');
    } finally {
      setLoading(false);
    }
  };

  const claimAllRewards = async () => {
    try {
      setLoading(true);
      const tx = await savingsContract.claimAllRewards();
      
      await toast.promise(tx.wait(), {
        loading: '🎁 Claiming all rewards...',
        success: '✅ All rewards claimed!',
        error: '❌ Failed to claim rewards'
      });
      
      await loadSavingsAccounts(account, savingsContract, provider);
      
    } catch (error) {
      console.error(error);
      toast.error('Failed to claim rewards');
    } finally {
      setLoading(false);
    }
  };

  const createTimeAccount = async (unlockDate, goalName, initialDeposit, currency) => {
    try {
      setLoading(true);
      
      // Check minimum deposit
      if (!checkMinimumDeposit(initialDeposit)) {
        const minRequired = getMinimumDepositInCurrency(currency);
        toast.error(`Minimum deposit is ${formatCurrency(minRequired, currency)} (≈ €10)`);
        setLoading(false);
        return;
      }
      
      if (parseFloat(balance) < parseFloat(initialDeposit)) {
        const needed = parseFloat(initialDeposit) - parseFloat(balance);
        
        // Open buy modal with exact amount needed
        toast(`You need ${needed.toFixed(0)} more OOOWEEE`, { icon: '💡' });
        await openBuyModalWithAmount(needed);
        setLoading(false);
        return;
      }
      
      const unlockTime = Math.floor(new Date(unlockDate).getTime() / 1000);
      const depositAmount = ethers.utils.parseUnits(initialDeposit.toString(), 18);
      
      const approveTx = await tokenContract.approve(CONTRACT_ADDRESSES.OOOWEEESavings, depositAmount);
      
      await toast.promise(approveTx.wait(), {
        loading: '🔓 Approving tokens...',
        success: '✅ Tokens approved!',
        error: '❌ Failed to approve'
      });
      
      const createTx = await savingsContract.createTimeAccountFiat(
        unlockTime,
        goalName,
        depositAmount,
        CURRENCIES[currency].code
      );
      
      await toast.promise(createTx.wait(), {
        loading: '🐷 Creating piggy bank...',
        success: `🎉 Time account created with ${initialDeposit} $OOOWEEE!`,
        error: '❌ Failed to create account'
      });
      
      await loadSavingsAccounts(account, savingsContract, provider);
      await loadBalances(account, provider, tokenContract);
    } catch (error) {
      console.error(error);
      if (error.code === 'ACTION_REJECTED') {
        toast.error('Transaction cancelled');
      } else if (error.reason?.includes('Deposit below minimum')) {
        toast.error('Deposit below minimum (€10)');
      } else {
        toast.error('Failed to create account: ' + (error.reason || error.message));
      }
    } finally {
      setLoading(false);
    }
  };

  // FIX: Better validation for Growth account creation
  const createGrowthAccount = async (targetAmount, goalName, initialDeposit, currency) => {
    try {
      setLoading(true);
      
      // Check minimum deposit
      if (!checkMinimumDeposit(initialDeposit)) {
        const minRequired = getMinimumDepositInCurrency(currency);
        toast.error(`Minimum deposit is ${formatCurrency(minRequired, currency)} (≈ €10)`);
        setLoading(false);
        return;
      }
      
      // Calculate initial fiat value to validate
      const currencyCode = currency.toLowerCase();
      const ethPriceForCurrency = ethPrice?.[currencyCode] || ethPrice?.eur || 1850;
      const initialDepositFiatValue = parseFloat(initialDeposit) * oooweeePrice * ethPriceForCurrency;
      
      // Contract requires target > initial value
      if (initialDepositFiatValue >= parseFloat(targetAmount)) {
        toast.error(`Initial deposit value (${formatCurrency(initialDepositFiatValue, currency)}) must be less than target (${formatCurrency(targetAmount, currency)}). Use a smaller deposit or higher target.`);
        setLoading(false);
        return;
      }
      
      if (parseFloat(balance) < parseFloat(initialDeposit)) {
        const needed = parseFloat(initialDeposit) - parseFloat(balance);
        
        // Open buy modal with exact amount needed
        toast(`You need ${needed.toFixed(0)} more OOOWEEE`, { icon: '💡' });
        await openBuyModalWithAmount(needed);
        setLoading(false);
        return;
      }
      
      const targetInSmallestUnit = Math.round(targetAmount * Math.pow(10, CURRENCIES[currency].decimals));
      const depositAmount = ethers.utils.parseUnits(initialDeposit.toString(), 18);
      
      const approveTx = await tokenContract.approve(CONTRACT_ADDRESSES.OOOWEEESavings, depositAmount);
      
      await toast.promise(approveTx.wait(), {
        loading: '🔓 Approving tokens...',
        success: '✅ Tokens approved!',
        error: '❌ Failed to approve'
      });
      
      const createTx = await savingsContract.createGrowthAccountFiat(
        targetInSmallestUnit,
        CURRENCIES[currency].code,
        goalName,
        depositAmount
      );
      
      await toast.promise(createTx.wait(), {
        loading: '🌱 Planting money tree...',
        success: `🎉 Growth account created! Target: ${CURRENCIES[currency].symbol}${targetAmount}`,
        error: '❌ Failed to create account'
      });
      
      await loadSavingsAccounts(account, savingsContract, provider);
      await loadBalances(account, provider, tokenContract);
    } catch (error) {
      console.error(error);
      if (error.code === 'ACTION_REJECTED') {
        toast.error('Transaction cancelled');
      } else if (error.reason?.includes('Target must be higher')) {
        toast.error('Target must be higher than initial deposit value');
      } else if (error.reason?.includes('Deposit below minimum')) {
        toast.error('Deposit below minimum (€10)');
      } else {
        toast.error('Failed to create account: ' + (error.reason || error.message));
      }
    } finally {
      setLoading(false);
    }
  };

  const createBalanceAccount = async (targetAmount, recipientAddress, goalName, initialDeposit, currency) => {
    try {
      setLoading(true);
      
      // Check minimum deposit
      if (!checkMinimumDeposit(initialDeposit)) {
        const minRequired = getMinimumDepositInCurrency(currency);
        toast.error(`Minimum deposit is ${formatCurrency(minRequired, currency)} (≈ €10)`);
        setLoading(false);
        return;
      }
      
      if (parseFloat(balance) < parseFloat(initialDeposit)) {
        const needed = parseFloat(initialDeposit) - parseFloat(balance);
        
        // Open buy modal with exact amount needed
        toast(`You need ${needed.toFixed(0)} more OOOWEEE`, { icon: '💡' });
        await openBuyModalWithAmount(needed);
        setLoading(false);
        return;
      }
      
      const targetInSmallestUnit = Math.round(targetAmount * Math.pow(10, CURRENCIES[currency].decimals));
      const depositAmount = ethers.utils.parseUnits(initialDeposit.toString(), 18);
      
      const approveTx = await tokenContract.approve(CONTRACT_ADDRESSES.OOOWEEESavings, depositAmount);
      
      await toast.promise(approveTx.wait(), {
        loading: '🔓 Approving tokens...',
        success: '✅ Tokens approved!',
        error: '❌ Failed to approve'
      });
      
      const createTx = await savingsContract.createBalanceAccountFiat(
        targetInSmallestUnit,
        CURRENCIES[currency].code,
        recipientAddress,
        goalName,
        depositAmount
      );
      
      await toast.promise(createTx.wait(), {
        loading: '⚖️ Setting up balance account...',
        success: `🎉 Balance account created! Will send to ${recipientAddress.slice(0,6)}...`,
        error: '❌ Failed to create account'
      });
      
      await loadSavingsAccounts(account, savingsContract, provider);
      await loadBalances(account, provider, tokenContract);
    } catch (error) {
      console.error(error);
      if (error.code === 'ACTION_REJECTED') {
        toast.error('Transaction cancelled');
      } else if (error.reason?.includes('Deposit below minimum')) {
        toast.error('Deposit below minimum (€10)');
      } else {
        toast.error('Failed to create account: ' + (error.reason || error.message));
      }
    } finally {
      setLoading(false);
    }
  };

  const handleCreateAccount = async () => {
    const goalName = document.getElementById('goalName').value;
    const initialDeposit = document.getElementById('initialDeposit').value;
    
    if (!goalName) {
      toast.error('Please enter a quest name');
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
      createTimeAccount(unlockDate, goalName, initialDeposit, accountCurrency);
    } else if (accountType === 'growth') {
      const targetAmount = document.getElementById('targetAmount').value;
      if (!targetAmount || targetAmount <= 0) {
        toast.error('Please enter a valid target amount');
        return;
      }
      createGrowthAccount(targetAmount, goalName, initialDeposit, accountCurrency);
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
      createBalanceAccount(targetAmount, recipientAddress, goalName, initialDeposit, accountCurrency);
    }
  };

  const depositToAccount = async (accountId, amount) => {
    try {
      setLoading(true);
      
      const depositAmountNumber = parseFloat(amount);
      const currentBalance = parseFloat(balance);
      
      if (currentBalance < depositAmountNumber) {
        const needed = depositAmountNumber - currentBalance;
        
        // Open buy modal with exact amount needed
        toast(`You need ${needed.toFixed(0)} more OOOWEEE`, { icon: '💡' });
        await openBuyModalWithAmount(needed);
        setLoading(false);
        return;
      }
      
      const depositAmount = ethers.utils.parseUnits(depositAmountNumber.toString(), 18);
      
      const approveTx = await tokenContract.approve(CONTRACT_ADDRESSES.OOOWEEESavings, depositAmount);
      
      await toast.promise(approveTx.wait(), {
        loading: '🔓 Approving tokens...',
        success: '✅ Tokens approved!',
        error: '❌ Failed to approve'
      });
      
      const depositTx = await savingsContract.deposit(accountId, depositAmount);
      
      await toast.promise(depositTx.wait(), {
        loading: `💰 Depositing ${depositAmountNumber} OOOWEEE...`,
        success: `🎉 Deposited ${depositAmountNumber} $OOOWEEE!`,
        error: '❌ Failed to deposit'
      });
      
      await loadSavingsAccounts(account, savingsContract, provider);
      await loadBalances(account, provider, tokenContract);

    } catch (error) {
      console.error(error);
      if (error.code === 'ACTION_REJECTED') {
        toast.error('Transaction cancelled');
      } else {
        toast.error('Failed to deposit: ' + error.message);
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

  const getCurrencyFromCode = (code) => {
    const currencies = Object.keys(CURRENCIES);
    return currencies[code] || 'EUR';
  };

  const activeAccounts = accounts.filter(acc => acc.isActive);
  const completedAccounts = accounts.filter(acc => !acc.isActive);

  if (isAppLoading) {
    return (
      <div className="loading-screen">
        <img src={oooweeLogo} alt="Loading..." className="loading-logo pixel-art" />
        <div className="loading-bar">
          <div className="loading-progress"></div>
        </div>
        <p className="loading-text">Loading OOOWEEE Protocol...</p>
      </div>
    );
  }

  // Enhanced Buy Modal with exact amount mode
  const BuyModal = () => {
    const [estimatedEthForExact, setEstimatedEthForExact] = useState('0');
    
    useEffect(() => {
      const fetchEthEstimate = async () => {
        if (buyMode === 'exact' && requiredOooweeeForPurchase) {
          const eth = await calculateEthForExactOooweee(requiredOooweeeForPurchase);
          if (eth) setEstimatedEthForExact(eth);
        }
      };
      fetchEthEstimate();
    }, [requiredOooweeeForPurchase, buyMode]);
    
    return (
      <div className="modal-overlay" onClick={() => {
        setShowBuyModal(false);
        setRequiredOooweeeForPurchase(null);
        setBuyMode('eth');
      }}>
        <div className="modal-content" onClick={(e) => e.stopPropagation()}>
          <h2>🛒 Buy $OOOWEEE</h2>
          <button className="close-modal" onClick={() => {
            setShowBuyModal(false);
            setRequiredOooweeeForPurchase(null);
            setBuyMode('eth');
          }}>✕</button>
          
          <div className="buy-form">
            <div className="balance-info">
              <p>ETH Balance: {parseFloat(ethBalance).toFixed(4)} ETH</p>
              <p>Current Rate: 1 ETH ≈ {(1/oooweeePrice).toFixed(0)} OOOWEEE</p>
            </div>
            
            {buyMode === 'exact' && requiredOooweeeForPurchase ? (
              <>
                <div className="exact-amount-notice">
                  <p>💡 You need exactly:</p>
                  <h3>{Math.ceil(requiredOooweeeForPurchase).toLocaleString()} $OOOWEEE</h3>
                  <p className="eth-estimate">≈ {parseFloat(estimatedEthForExact).toFixed(6)} ETH (incl. 5% buffer)</p>
                </div>
                
                <button 
                  className="buy-btn rainbow-btn"
                  onClick={buyExactOooweee}
                  disabled={loading || parseFloat(estimatedEthForExact) > parseFloat(ethBalance)}
                >
                  {loading ? '⏳ Processing...' : `🚀 Buy Exactly ${Math.ceil(requiredOooweeeForPurchase).toLocaleString()} OOOWEEE`}
                </button>
                
                {parseFloat(estimatedEthForExact) > parseFloat(ethBalance) && (
                  <p className="error-text">⚠️ Insufficient ETH balance</p>
                )}
                
                <div className="mode-switch">
                  <button 
                    className="switch-mode-btn"
                    onClick={() => {
                      setBuyMode('eth');
                      setRequiredOooweeeForPurchase(null);
                    }}
                  >
                    Or buy a custom amount →
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="input-group">
                  <label>ETH Amount:</label>
                  <input
                    type="number"
                    value={ethToBuy}
                    onChange={(e) => setEthToBuy(e.target.value)}
                    min="0.001"
                    step="0.001"
                    max={ethBalance}
                  />
                </div>
                
                <div className="output-estimate">
                  <p>You will receive approximately:</p>
                  <h3>{parseFloat(estimatedOooweee).toLocaleString()} $OOOWEEE</h3>
                  {ethPrice && (
                    <p className="fiat-value">≈ {getOooweeeInFiat(estimatedOooweee, 'eur')}</p>
                  )}
                </div>
                
                <div className="quick-amounts">
                  <button onClick={() => setEthToBuy('0.01')}>0.01 ETH</button>
                  <button onClick={() => setEthToBuy('0.05')}>0.05 ETH</button>
                  <button onClick={() => setEthToBuy('0.1')}>0.1 ETH</button>
                  <button onClick={() => setEthToBuy('0.5')}>0.5 ETH</button>
                </div>
                
                <button 
                  className="buy-btn rainbow-btn"
                  onClick={buyOooweee}
                  disabled={loading || parseFloat(ethToBuy) <= 0}
                >
                  {loading ? '⏳ Processing...' : '🚀 Swap for OOOWEEE'}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    );
  };

  const renderAboutPage = () => (
    <div className="about-page">
      <div className="about-header">
        <img src={oooweeLogo} alt="OOOWEEE" className="about-logo pixel-art" />
        <h1>The OOOWEEE Protocol</h1>
        <p className="subtitle">Decentralized Savings Revolution</p>
      </div>

      <div className="about-section">
        <h2>🎯 The Problem</h2>
        <p>Traditional banks make it too easy to break your savings goals. That "7-day cooling period"? You can still break it. Those withdrawal fees? They're not enough to stop impulsive spending.</p>
      </div>

      <div className="about-section">
        <h2>💡 The Solution</h2>
        <p>OOOWEEE creates truly immutable savings accounts using smart contracts. When you lock your funds, they're REALLY locked - no bank manager can override it, no "forgot password" backdoor. Your future self will thank you.</p>
      </div>

      <div className="value-flow">
        <h2>🔄 How It Works</h2>
        <div className="flow-diagram">
          <div className="flow-step">
            <span className="step-icon">📈</span>
            <h3>Speculation</h3>
            <p>Traders buy OOOWEEE, price increases</p>
          </div>
          <div className="flow-arrow">→</div>
          <div className="flow-step">
            <span className="step-icon">🛡️</span>
            <h3>Stability</h3>
            <p>System sells into pumps, captures ETH</p>
          </div>
          <div className="flow-arrow">→</div>
          <div className="flow-step">
            <span className="step-icon">🔐</span>
            <h3>Validators</h3>
            <p>ETH funds validators, earns 4% APY</p>
          </div>
          <div className="flow-arrow">→</div>
          <div className="flow-step">
            <span className="step-icon">🎁</span>
            <h3>Rewards</h3>
            <p>Savers earn passive income</p>
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
        <button onClick={() => setActiveTab('dashboard')} className="cta-button rainbow-btn">
          Start Saving Now
        </button>
      </div>
    </div>
  );
  
  // Improved Admin Dashboard
  const renderAdminDashboard = () => (
    <div className="admin-dashboard">
      <div className="admin-header">
        <h1>🔧 Protocol Admin Dashboard</h1>
        <p className="admin-address">Connected: {account.slice(0, 6)}...{account.slice(-4)}</p>
      </div>
      
      {/* System Health Overview */}
      <div className="admin-section">
        <h2>🟢 System Health</h2>
        <div className="admin-grid-4">
          <div className="admin-card">
            <div className="admin-card-icon">{adminStats.isSequencerHealthy ? '✅' : '🔴'}</div>
            <div className="admin-card-content">
              <h4>L2 Chain</h4>
              <p>Block #{adminStats.blockNumber}</p>
            </div>
          </div>
          <div className="admin-card">
            <div className="admin-card-icon">{adminStats.isPriceOracleHealthy ? '✅' : '🔴'}</div>
            <div className="admin-card-content">
              <h4>Price Oracle</h4>
              <p>${parseFloat(oooweeePrice).toFixed(8)}</p>
            </div>
          </div>
          <div className="admin-card">
            <div className="admin-card-icon">{!adminStats.circuitBreakerTripped ? '✅' : '🔴'}</div>
            <div className="admin-card-content">
              <h4>Circuit Breaker</h4>
              <p>{adminStats.circuitBreakerTripped ? 'TRIPPED' : 'Active'}</p>
            </div>
          </div>
          <div className="admin-card">
            <div className="admin-card-icon">{adminStats.marketHighVolatility ? '⚠️' : '✅'}</div>
            <div className="admin-card-content">
              <h4>Market Status</h4>
              <p>{adminStats.marketHighVolatility ? 'High Volatility' : 'Normal'}</p>
            </div>
          </div>
        </div>
      </div>
      
      {/* Protocol Metrics */}
      <div className="admin-section">
        <h2>📊 Protocol Metrics</h2>
        <div className="admin-grid-4">
          <div className="admin-card metric">
            <h4>Total Value Locked</h4>
            <p className="metric-value">{parseFloat(adminStats.totalValueLocked).toLocaleString()}</p>
            <span className="metric-label">OOOWEEE</span>
            <span className="metric-usd">≈ {getOooweeeInFiat(adminStats.totalValueLocked, 'eur')}</span>
          </div>
          <div className="admin-card metric">
            <h4>Total Accounts</h4>
            <p className="metric-value">{adminStats.totalAccountsCreated}</p>
            <span className="metric-label">({adminStats.totalGoalsCompleted} completed)</span>
          </div>
          <div className="admin-card metric">
            <h4>Active Balance</h4>
            <p className="metric-value">{parseFloat(adminStats.totalActiveBalance).toLocaleString()}</p>
            <span className="metric-label">OOOWEEE</span>
          </div>
          <div className="admin-card metric">
            <h4>Fees Collected</h4>
            <p className="metric-value">{parseFloat(adminStats.totalFeesCollected).toFixed(2)}</p>
            <span className="metric-label">OOOWEEE</span>
          </div>
        </div>
      </div>
      
      {/* Stability Mechanism */}
      <div className="admin-section">
        <h2>🛡️ Stability Mechanism (SSA)</h2>
        
        <div className="stability-info-banner">
          <div className="stability-price-info">
            <div className="price-item">
              <label>Current Price</label>
              <span>{parseFloat(adminStats.currentPrice).toFixed(12)} ETH</span>
            </div>
            <div className="price-item">
              <label>Baseline Price</label>
              <span>{parseFloat(adminStats.baselinePrice).toFixed(12)} ETH</span>
            </div>
            <div className="price-item highlight">
              <label>Price Increase</label>
              <span className={adminStats.priceIncreasePercent > 20 ? 'warning' : ''}>
                {adminStats.priceIncreasePercent}%
              </span>
            </div>
          </div>
        </div>
        
        <div className="admin-grid-3">
          <div className="admin-card">
            <h4>Reserve Balance</h4>
            <p className="metric-value">{parseFloat(adminStats.tokenBalance).toLocaleString()}</p>
            <span className="metric-label">OOOWEEE</span>
          </div>
          <div className="admin-card">
            <h4>Interventions Today</h4>
            <p className="metric-value">{adminStats.interventionsToday} / 10</p>
            <div className="mini-progress">
              <div style={{width: `${(adminStats.interventionsToday / 10) * 100}%`}}></div>
            </div>
          </div>
          <div className="admin-card">
            <h4>Tokens Used Today</h4>
            <p className="metric-value">{parseFloat(adminStats.tokensUsedToday).toFixed(0)}</p>
            <span className="metric-label">/ 1,000,000</span>
          </div>
        </div>
        
        <div className="admin-grid-3">
          <div className="admin-card">
            <h4>Total ETH Captured</h4>
            <p className="metric-value">{parseFloat(adminStats.totalETHCaptured).toFixed(4)}</p>
            <span className="metric-label">ETH</span>
          </div>
          <div className="admin-card">
            <h4>ETH to Validators</h4>
            <p className="metric-value">{parseFloat(adminStats.totalETHSentToValidators).toFixed(4)}</p>
            <span className="metric-label">ETH</span>
          </div>
          <div className="admin-card">
            <h4>Total Interventions</h4>
            <p className="metric-value">{adminStats.totalInterventions}</p>
            <span className="metric-label">all time</span>
          </div>
        </div>
        
        {/* Emergency Controls */}
        <div className="emergency-controls-section">
          <h3>⚠️ Admin Controls</h3>
          <div className="control-buttons-grid">
            <button 
              className="admin-btn primary"
              onClick={updateBaselinePrice}
              disabled={loading}
            >
              📊 Update Baseline Price
            </button>
            <button 
              className="admin-btn primary"
              onClick={triggerSystemCheck}
              disabled={loading}
            >
              ⚡ Trigger System Check
            </button>
            <button 
              className="admin-btn secondary"
              onClick={manualStabilityCheck}
              disabled={loading}
            >
              🔍 Manual Check (0.01 ETH)
            </button>
            <button 
              className="admin-btn warning"
              onClick={resetCircuitBreaker}
              disabled={loading || !adminStats.circuitBreakerTripped}
            >
              🔄 Reset Circuit Breaker
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  // Calculate fiat value for initial deposit display
  const getInitialDepositFiatValue = () => {
    if (!initialDepositInput || parseFloat(initialDepositInput) <= 0) return null;
    const fiatValue = convertOooweeeToFiat(initialDepositInput, accountCurrency.toLowerCase());
    return fiatValue;
  };

  // Get minimum deposit in OOOWEEE for current currency
  const getMinimumOooweeeDeposit = () => {
    const minFiat = getMinimumDepositInCurrency(accountCurrency);
    return convertFiatToOooweee(minFiat, accountCurrency.toLowerCase());
  };

  return (
    <div className="App">
      <Toaster position="top-center" />
      {showBuyModal && <BuyModal />}
      
      <header className="App-header">
        {/* Tab Navigation */}
        <nav className="tab-navigation">
          <button 
            className={`tab-btn ${activeTab === 'about' ? 'active' : ''}`}
            onClick={() => setActiveTab('about')}
          >
            📖 About
          </button>
          <button 
            className={`tab-btn ${activeTab === 'dashboard' ? 'active' : ''}`}
            onClick={() => setActiveTab('dashboard')}
          >
            🏠 Dashboard
          </button>
          {account?.toLowerCase() === ADMIN_WALLET.toLowerCase() && (
            <button 
              className={`tab-btn ${activeTab === 'admin' ? 'active' : ''}`}
              onClick={() => setActiveTab('admin')}
            >
              ⚙️ Admin
            </button>
          )}
        </nav>
        
        {activeTab === 'about' && renderAboutPage()}
        
        {activeTab === 'admin' && account?.toLowerCase() === ADMIN_WALLET.toLowerCase() && renderAdminDashboard()}
        
        {activeTab === 'dashboard' && (
          <>
            <div className="hero-section">
              <img src={oooweeLogo} alt="OOOWEEE" className="main-logo pixel-art" />
              <h1 className="hero-title">OOOWEEE SAVINGS</h1>
              <p className="hero-subtitle">Lock It. Grow It. Keep It.</p>
            </div>
            
            {!account ? (
              <div className="connect-section">
                <p className="connect-text">Connect your wallet to start saving!</p>
                <button 
                  onClick={connectWallet} 
                  disabled={loading}
                  className="connect-btn rainbow-btn"
                >
                  {loading ? '⏳ Connecting...' : '🔗 Connect Wallet'}
                </button>
              </div>
            ) : (
              <div className="dashboard">
                {/* Wallet Info Card */}
                <div className="wallet-card">
                  <div className="wallet-header">
                    <h2>👛 Your Wallet</h2>
                    <button onClick={disconnectWallet} className="disconnect-btn">
                      Disconnect
                    </button>
                  </div>
                  
                  <div className="wallet-info">
                    <div className="info-item">
                      <span className="label">Address:</span>
                      <span className="value">{account.slice(0, 6)}...{account.slice(-4)}</span>
                    </div>
                    <div className="info-item">
                      <span className="label">$OOOWEEE:</span>
                      <span className="value highlight">{parseFloat(balance).toLocaleString()}</span>
                      <span className="fiat-equiv">≈ {getOooweeeInFiat(balance, 'eur')}</span>
                    </div>
                    <div className="info-item">
                      <span className="label">ETH:</span>
                      <span className="value">{parseFloat(ethBalance).toFixed(4)}</span>
                    </div>
                  </div>
                  
                  <button 
                    onClick={() => {
                      setBuyMode('eth');
                      setRequiredOooweeeForPurchase(null);
                      setShowBuyModal(true);
                    }} 
                    className="buy-oooweee-btn"
                  >
                    🛒 Buy $OOOWEEE
                  </button>
                </div>
                
                {/* Validator Fund Card */}
                <div className="validator-card">
                  <div className="validator-header">
                    <h3>⛓️ Validator Fund</h3>
                  </div>
                  
                  <div className="validator-progress">
                    <div className="progress-bar large">
                      <div 
                        className="progress-fill"
                        style={{ width: `${validatorStats.progress}%` }}
                      />
                      <span className="progress-text">
                        {validatorStats.progress.toFixed(1)}% to next validator
                      </span>
                    </div>
                  </div>
                  
                  <div className="stats-grid">
                    <div className="stat">
                      <span className="label">Active Validators</span>
                      <span className="value">{validatorStats.validators}</span>
                    </div>
                    <div className="stat">
                      <span className="label">ETH Needed</span>
                      <span className="value">{parseFloat(validatorStats.nextValidatorIn).toFixed(2)}</span>
                    </div>
                    <div className="stat">
                      <span className="label">Pending ETH</span>
                      <span className="value">{parseFloat(validatorStats.pendingETH).toFixed(4)}</span>
                    </div>
                    <div className="stat">
                      <span className="label">Donors</span>
                      <span className="value">{validatorStats.donors}</span>
                    </div>
                  </div>
                  
                  <div className="donation-info">
                    <p>💜 Total Donated: {parseFloat(validatorStats.totalDonations).toFixed(4)} ETH</p>
                    <p>🛡️ From Stability: {parseFloat(validatorStats.fromStability).toFixed(4)} ETH</p>
                  </div>
                  
                  <button onClick={donateToValidators} disabled={loading} className="donate-btn">
                    💰 Donate ETH to Validators
                  </button>
                </div>
                
                {/* Active Accounts Section */}
                <div className="accounts-section">
                  <div className="section-header">
                    <h2>🎮 Your Savings Quests</h2>
                    {activeAccounts.length > 0 && (
                      <button onClick={claimAllRewards} disabled={loading} className="claim-all-btn">
                        🎁 Claim All Rewards
                      </button>
                    )}
                  </div>
                  
                  {activeAccounts.length === 0 ? (
                    <div className="no-accounts">
                      <p>No active savings quests yet!</p>
                      <p>Create your first one below 👇</p>
                    </div>
                  ) : (
                    <>
                      <div className="currency-toggle">
                        <button 
                          className={displayCurrency === 'fiat' ? 'active' : ''}
                          onClick={() => setDisplayCurrency('fiat')}
                        >
                          💶 Fiat
                        </button>
                        <button 
                          className={displayCurrency === 'crypto' ? 'active' : ''}
                          onClick={() => setDisplayCurrency('crypto')}
                        >
                          🪙 Crypto
                        </button>
                      </div>
                      
                      <div className="accounts-grid">
                        {activeAccounts.map(acc => {
                          const currencyCode = getCurrencyFromCode(acc.targetCurrency);
                          return (
                            <div key={acc.id} className={`account-card ${acc.type.toLowerCase()}`}>
                              <div className="account-header">
                                <h3>{acc.goalName}</h3>
                                <span className={`account-type ${acc.type.toLowerCase()}`}>{acc.type}</span>
                              </div>
                              
                              <div className="progress-bar">
                                <div 
                                  className="progress-fill"
                                  style={{ width: `${acc.progress}%` }}
                                />
                                <span className="progress-text">{acc.progress}%</span>
                              </div>
                              
                              <div className="account-details">
                                <p>
                                  <strong>Balance:</strong> {displayCurrency === 'crypto'
                                    ? `${parseFloat(acc.balance).toLocaleString()} $OOOWEEE`
                                    : getOooweeeInFiat(acc.balance, currencyCode.toLowerCase())
                                  }
                                </p>
                                
                                {acc.type === 'Time' && (
                                  <p>
                                    <strong>Unlocks:</strong> {getDaysRemaining(acc.unlockTime) > 0 
                                      ? `${getDaysRemaining(acc.unlockTime)} days`
                                      : '🔓 Ready!'}
                                  </p>
                                )}
                                
                                {(acc.type === 'Growth' || acc.type === 'Balance') && acc.isFiatTarget && (
                                  <p>
                                    <strong>Target:</strong> {displayCurrency === 'crypto'
                                      ? `${convertFiatToOooweee(acc.targetFiat / 100, currencyCode.toLowerCase()).toLocaleString()} $OOOWEEE`
                                      : formatCurrency(acc.targetFiat / 100, currencyCode)
                                    }
                                  </p>
                                )}
                                
                                {acc.type === 'Balance' && acc.recipient && (
                                  <p>
                                    <strong>To:</strong> {acc.recipient.slice(0, 6)}...{acc.recipient.slice(-4)}
                                  </p>
                                )}
                              </div>
                              
                              <div className="account-actions">
                                <button 
                                  onClick={() => claimRewards(acc.id)} 
                                  disabled={loading}
                                  className="claim-btn"
                                >
                                  🎁 Claim
                                </button>
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
                                    const input = document.getElementById(`deposit-${acc.id}`);
                                    const amount = input?.value;
                                    if (amount && parseFloat(amount) > 0) {
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
                          );
                        })}
                      </div>
                      
                      {showCompleted && completedAccounts.length > 0 && (
                        <div className="completed-section">
                          <h3>✅ Completed Quests</h3>
                          <div className="accounts-grid">
                            {completedAccounts.map(acc => (
                              <div key={acc.id} className="account-card completed">
                                <div className="account-header">
                                  <h3>{acc.goalName} ✅</h3>
                                  <span className={`account-type ${acc.type.toLowerCase()}`}>{acc.type}</span>
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
                    <label>💱 Display Currency:</label>
                    <select 
                      value={accountCurrency}
                      onChange={(e) => setAccountCurrency(e.target.value)}
                      className="select-input"
                    >
                      {Object.entries(CURRENCIES).map(([code, info]) => (
                        <option key={code} value={code}>{info.symbol} {info.name}</option>
                      ))}
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
                    <label>💰 Initial Deposit ({CURRENCIES[accountCurrency].symbol}):</label>
                    <input 
                      type="number" 
                      placeholder={`Min ${formatCurrency(getMinimumDepositInCurrency(accountCurrency), accountCurrency)} (≈ €10)`}
                      id="initialDeposit"
                      min="0.001"
                      step="0.001"
                      value={initialDepositInput}
                      onChange={(e) => setInitialDepositInput(e.target.value)}
                      className="number-input"
                    />
                    {initialDepositInput && (
                      <div className="deposit-conversion">
                        <p className="conversion-note">
                          ≈ {convertFiatToOooweee(initialDepositInput, accountCurrency.toLowerCase()).toLocaleString()} $OOOWEEE
                        </p>
                        {parseFloat(balance) < convertFiatToOooweee(initialDepositInput, accountCurrency.toLowerCase()) && (
                          <p className="swap-notice">⚠️ Insufficient balance - will offer to buy with ETH</p>
                        )}
                        {convertOooweeeToFiat(convertFiatToOooweee(initialDepositInput, accountCurrency.toLowerCase()), 'eur') < 10 && (
                          <p className="error-note">⚠️ Minimum deposit is €10</p>
                        )}
                      </div>
                    )}
                    <p className="fee-note">💡 1% creation fee from initial deposit</p>
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
                      <label>🎯 Target Amount ({CURRENCIES[accountCurrency].symbol}):</label>
                      <input 
                        type="number" 
                        placeholder={`Target in ${CURRENCIES[accountCurrency].name}`}
                        id="targetAmount"
                        value={targetAmountInput}
                        onChange={(e) => setTargetAmountInput(e.target.value)}
                        min="1"
                        step="1"
                        className="number-input"
                      />
                      {targetAmountInput && (
                        <p className="conversion-note">
                          ≈ {convertFiatToOooweee(targetAmountInput, accountCurrency.toLowerCase()).toLocaleString()} $OOOWEEE at current rate
                        </p>
                      )}
                      {accountType === 'growth' && initialDepositInput && targetAmountInput && (
                        (() => {
                          const initialFiatValue = parseFloat(initialDepositInput);
                          if (initialFiatValue >= parseFloat(targetAmountInput)) {
                            return <p className="error-note">⚠️ Target must be higher than initial deposit value ({formatCurrency(initialFiatValue, accountCurrency)})</p>;
                          }
                          return null;
                        })()
                      )}
                    </div>
                  )}
                  
                  {accountType === 'balance' && (
                    <div className="form-group">
                      <label>📮 Recipient Address:</label>
                      <input 
                        type="text" 
                        placeholder="0x..." 
                        id="recipientAddress"
                        className="text-input"
                      />
                      <p className="info-note">Auto-sends when target + 1% is reached</p>
                    </div>
                  )}
                  
                  <button 
                    onClick={() => {
                      // Convert fiat input to OOOWEEE before creating
                      const fiatAmount = parseFloat(initialDepositInput);
                      if (fiatAmount > 0) {
                        const oooweeeAmount = convertFiatToOooweee(fiatAmount, accountCurrency.toLowerCase());
                        document.getElementById('initialDeposit').value = oooweeeAmount;
                      }
                      handleCreateAccount();
                    }}
                    disabled={loading}
                    className="create-btn rainbow-btn"
                  >
                    {loading ? '⏳ Processing...' : '🚀 Create Account'}
                  </button>
                </div>
                
                {completedAccounts.length > 0 && (
                  <div className="toggle-completed">
                    <button onClick={() => setShowCompleted(!showCompleted)} className="toggle-btn">
                      {showCompleted ? '📦 Hide' : '👁️ Show'} Completed ({completedAccounts.length})
                    </button>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </header>
    </div>
  );
}

export default App;