import React, { useState, useEffect, useCallback, useRef } from 'react';
import { ethers } from 'ethers';
import toast, { Toaster } from 'react-hot-toast';
import './App.css';
import oooweeLogo from './assets/oooweee-logo.png';
import { OOOWEEETokenABI, OOOWEEESavingsABI, OOOWEEEValidatorFundABI, OOOWEEEStabilityABI, DonorRegistryABI, CONTRACT_ADDRESSES } from './contracts/abis';
import Web3Modal from "web3modal";
import WalletConnectProvider from "@walletconnect/web3-provider";
import { Web3Auth } from "@web3auth/modal";
import { EthereumPrivateKeyProvider } from "@web3auth/ethereum-provider";
import { CHAIN_NAMESPACES, WEB3AUTH_NETWORK } from "@web3auth/base";

// Uniswap Router ABI (minimal)
const UNISWAP_ROUTER_ABI = [
  "function swapExactETHForTokens(uint amountOutMin, address[] calldata path, address to, uint deadline) external payable returns (uint[] memory amounts)",
  "function swapETHForExactTokens(uint amountOut, address[] calldata path, address to, uint deadline) external payable returns (uint[] memory amounts)",
  "function getAmountsOut(uint amountIn, address[] calldata path) public view returns (uint[] memory amounts)",
  "function getAmountsIn(uint amountOut, address[] calldata path) public view returns (uint[] memory amounts)",
  "function WETH() external pure returns (address)"
];

// Contract addresses — Ethereum Mainnet
const UNISWAP_ROUTER = "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D";
const WETH_ADDRESS = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";

// ADMIN WALLET - Update this to your operations wallet address
const ADMIN_WALLET = "0x438a0db92Ad7A94Da455110096d02D8eF7cd6A34";

// Web3Auth configuration
const WEB3AUTH_CLIENT_ID = "BJI5vavWlrqWJoj29XO3KwH6u7rTHAB1hBwvlpKlUA1Oeoo7mNwGE3MmmKFV0KweFBPl_GrgNsaq9U73MH95Fo8";

// Transak fiat onramp configuration
const TRANSAK_API_KEY = "5cb34a9b-f4da-43e8-8f4b-8e573b79ab22";
const CHAIN_CONFIG = {
  chainNamespace: CHAIN_NAMESPACES.EIP155,
  chainId: "0x1",
  rpcTarget: "https://ethereum-rpc.publicnode.com",
  displayName: "Ethereum Mainnet",
  blockExplorerUrl: "https://etherscan.io",
  ticker: "ETH",
  tickerName: "Ethereum",
  decimals: 18,
  isTestnet: false,
};


// Currency configuration - USD/EUR/GBP only
const CURRENCIES = {
  USD: { code: 0, symbol: '$', name: 'US Dollar', decimals: 8, locale: 'en-US' },
  EUR: { code: 1, symbol: '€', name: 'Euro', decimals: 8, locale: 'en-IE' },
  GBP: { code: 2, symbol: '£', name: 'British Pound', decimals: 8, locale: 'en-GB' }
};

// Web3Modal provider options
const providerOptions = {
  walletconnect: {
    package: WalletConnectProvider,
    options: {
      projectId: "084d65a488f56065ea7a901e023a8b3e",
      rpc: {
        1: "https://ethereum-rpc.publicnode.com"
      },
      chainId: 1,
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
  const [donorRegistryContract, setDonorRegistryContract] = useState(null);
  const [stabilityContract, setStabilityContract] = useState(null);
  const [routerContract, setRouterContract] = useState(null);
  const [balance, setBalance] = useState('0');
  const [balanceFiat, setBalanceFiat] = useState({}); // { usd: cents, eur: cents, gbp: pence } from oracle
  const [ethBalance, setEthBalance] = useState('0');
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [accountType, setAccountType] = useState('time');
  const [showCompleted, setShowCompleted] = useState(false);
  const [isAppLoading, setIsAppLoading] = useState(true);
  const [web3auth, setWeb3auth] = useState(null);
  const [loginMethod, setLoginMethod] = useState(null); // 'wallet' | 'social' | null
  const [ethPrice, setEthPrice] = useState(null);
  const [showFiat, setShowFiat] = useState(true);
  const [selectedCurrency, setSelectedCurrency] = useState(() => {
    return localStorage.getItem('oooweee_currency') || 'EUR';
  });
  const [web3Modal, setWeb3Modal] = useState(null);
  const [targetAmountInput, setTargetAmountInput] = useState('');
  const [initialDepositInput, setInitialDepositInput] = useState('');
  const [activeTab, setActiveTab] = useState('dashboard');
  const [showBuyModal, setShowBuyModal] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [ethToBuy, setEthToBuy] = useState('0.01');
  const [estimatedOooweee, setEstimatedOooweee] = useState('0');
  const [accountCurrency, setAccountCurrency] = useState(() => {
    return localStorage.getItem('oooweee_currency') || 'EUR';
  });
  const [isConnecting, setIsConnecting] = useState(false);
  const [requiredOooweeeForPurchase, setRequiredOooweeeForPurchase] = useState(null);
  const hasAutoReconnected = useRef(false);
  
  // Send modal state
  const [showSendModal, setShowSendModal] = useState(false);
  const [sendRecipient, setSendRecipient] = useState('');
  const [sendAmount, setSendAmount] = useState('');

  // Group savings state
  const [userGroups, setUserGroups] = useState([]);
  const [showGroupDetail, setShowGroupDetail] = useState(null);
  const [groupInviteAddress, setGroupInviteAddress] = useState('');
  const [groupDepositAmount, setGroupDepositAmount] = useState('');
  const [pendingInvitations, setPendingInvitations] = useState([]);
  const [groupSubType, setGroupSubType] = useState('time');
  const [groupDestination, setGroupDestination] = useState('');

  // Donate modal state
  const [showDonateModal, setShowDonateModal] = useState(false);
  const [donateAmount, setDonateAmount] = useState('0.05');
  const [donorMessage, setDonorMessage] = useState('');
  const [donorName, setDonorName] = useState('');
  const [donorLocation, setDonorLocation] = useState('');
  const [donorShoutout, setDonorShoutout] = useState(() => {
    // Load from localStorage on init
    const saved = localStorage.getItem('oooweee_donor_shoutout');
    return saved ? JSON.parse(saved) : null;
  });
  const [donorLeaderboard, setDonorLeaderboard] = useState(() => {
    // Load leaderboard from localStorage on init
    const saved = localStorage.getItem('oooweee_donor_leaderboard');
    return saved ? JSON.parse(saved) : [];
  });
  
  // Intro sequence state
  const [showIntro, setShowIntro] = useState(false);
  const [introStep, setIntroStep] = useState(0);

  // Validator stats
  const [validatorStats, setValidatorStats] = useState({
    validators: 0,
    nextValidatorIn: '32',
    progress: 0,
    pendingETH: '0',
    totalDonations: '0',
    donors: 0,
    fromStability: '0',
    fromRewards: '0',
    topDonor: null,
    topDonorAmount: '0'
  });
  
  // Price tracking
  const [oooweeePrice, setOooweeePrice] = useState(0.00001);
  const [priceFlash, setPriceFlash] = useState(null); // 'up' | 'down' | null
  const prevOooweeePriceRef = useRef(0.00001);
  const fiatOnrampPollRef = useRef(null);
  const [priceFeedStatus, setPriceFeedStatus] = useState({ source: 'live', cachedAt: null, error: null });

  // Admin Dashboard State
  const [userMetrics, setUserMetrics] = useState({ uniqueSavers: 0, tokenHolders: 0, loaded: false });
  const userMetricsLoadedRef = useRef(false);
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
  
  // Load admin statistics
  const loadAdminStats = useCallback(async () => {
    if (!stabilityContract || !savingsContract || !provider) return;

    try {
      const [stabilityInfo, marketConditions, circuitBreaker, statsView, blockNumber, checksEnabled] = await Promise.all([
        stabilityContract.getStabilityInfo(),
        stabilityContract.getMarketConditions(),
        stabilityContract.getCircuitBreakerStatus(),
        savingsContract.getStatsView(),
        provider.getBlockNumber(),
        stabilityContract.systemChecksEnabled()
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
        isPriceOracleHealthy: stabilityInfo[0].gt(0),
        systemChecksEnabled: checksEnabled
      });
    } catch (error) {
      console.error('Error loading admin stats:', error);
    }
  }, [stabilityContract, savingsContract, provider]);

  // Load user metrics from on-chain events (once per session, cached)
  const loadUserMetrics = useCallback(async () => {
    if (!savingsContract || !tokenContract || !provider || userMetricsLoadedRef.current) return;
    userMetricsLoadedRef.current = true;

    try {
      // Query AccountCreated events to count unique savers
      const DEPLOY_BLOCK = 24430000; // Approximate deployment block (Feb 11, 2026)
      const accountCreatedFilter = savingsContract.filters.AccountCreated();
      const events = await savingsContract.queryFilter(accountCreatedFilter, DEPLOY_BLOCK, 'latest');
      const uniqueAddresses = new Set(events.map(e => e.args.owner.toLowerCase()));

      // Count token holders via Transfer events
      const transferFilter = tokenContract.filters.Transfer();
      const transfers = await tokenContract.queryFilter(transferFilter, DEPLOY_BLOCK, 'latest');
      const holderBalances = {};
      for (const t of transfers) {
        const from = t.args.from.toLowerCase();
        const to = t.args.to.toLowerCase();
        holderBalances[to] = (holderBalances[to] || 0) + 1;
        if (from !== '0x0000000000000000000000000000000000000000') {
          holderBalances[from] = (holderBalances[from] || 0); // track that they had tokens
        }
      }
      // Exclude zero address and count addresses that received tokens
      delete holderBalances['0x0000000000000000000000000000000000000000'];
      const tokenHolderCount = Object.keys(holderBalances).length;

      setUserMetrics({ uniqueSavers: uniqueAddresses.size, tokenHolders: tokenHolderCount, loaded: true });
    } catch (error) {
      console.error('Error loading user metrics:', error);
      // Don't block the dashboard — just show 0s
      setUserMetrics(prev => ({ ...prev, loaded: true }));
    }
  }, [savingsContract, tokenContract, provider]);

  // Admin refresh interval
  useEffect(() => {
    if (account?.toLowerCase() === ADMIN_WALLET.toLowerCase() && activeTab === 'admin') {
      loadAdminStats();
      loadUserMetrics();
      const interval = setInterval(loadAdminStats, 5000);
      return () => clearInterval(interval);
    }
  }, [account, activeTab, stabilityContract, savingsContract, provider, loadAdminStats, loadUserMetrics]);

  // Stability event alerting — listen for circuit breaker and interventions
  useEffect(() => {
    if (!stabilityContract || !account) return;
    const isAdmin = account.toLowerCase() === ADMIN_WALLET.toLowerCase();

    const onCircuitBreakerTripped = (reason) => {
      toast.error(`Circuit breaker tripped: ${reason}`, { duration: 10000 });
      if (isAdmin) loadAdminStats();
    };

    const onIntervention = (tokensInjected, ethCaptured) => {
      if (isAdmin) {
        const tokens = parseFloat(ethers.utils.formatUnits(tokensInjected, 18)).toLocaleString();
        const eth = parseFloat(ethers.utils.formatEther(ethCaptured)).toFixed(4);
        toast(`Stability intervention: ${tokens} tokens sold for ${eth} ETH`, { duration: 8000 });
        loadAdminStats();
      }
    };

    const onCircuitBreakerReset = () => {
      if (isAdmin) {
        toast.success('Circuit breaker reset', { duration: 5000 });
        loadAdminStats();
      }
    };

    stabilityContract.on('CircuitBreakerTripped', onCircuitBreakerTripped);
    stabilityContract.on('StabilityIntervention', onIntervention);
    stabilityContract.on('CircuitBreakerReset', onCircuitBreakerReset);

    return () => {
      stabilityContract.off('CircuitBreakerTripped', onCircuitBreakerTripped);
      stabilityContract.off('StabilityIntervention', onIntervention);
      stabilityContract.off('CircuitBreakerReset', onCircuitBreakerReset);
    };
  }, [stabilityContract, account, loadAdminStats]);

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
      const newState = !adminStats.systemChecksEnabled;
      const tx = await stabilityContract.setChecksEnabled(newState);
      await toast.promise(tx.wait(), {
        loading: newState ? '▶️ Resuming checks...' : '⏸️ Pausing checks...',
        success: newState ? '✅ Checks resumed!' : '✅ Checks paused!',
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
  
  
  // Send tokens from wallet
  const sendTokens = async () => {
    if (!tokenContract || !sendRecipient || !sendAmount) return;
    try {
      setLoading(true);
      if (!ethers.utils.isAddress(sendRecipient)) {
        toast.error('Invalid recipient address');
        return;
      }
      const amount = ethers.utils.parseUnits(sendAmount, 18);
      const tx = await tokenContract.transfer(sendRecipient, amount);
      await toast.promise(tx.wait(), {
        loading: 'Sending OOOWEEE...',
        success: 'Sent successfully!',
        error: 'Transfer failed'
      });
      setShowSendModal(false);
      setSendRecipient('');
      setSendAmount('');
      await loadBalances(account, provider, tokenContract);
    } catch (error) {
      console.error(error);
      toast.error('Send failed: ' + (error.reason || error.message));
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

      // Initialize Web3Auth
      try {
        const privateKeyProvider = new EthereumPrivateKeyProvider({
          config: { chainConfig: CHAIN_CONFIG },
        });

        const web3authInstance = new Web3Auth({
          clientId: WEB3AUTH_CLIENT_ID,
          web3AuthNetwork: WEB3AUTH_NETWORK.SAPPHIRE_MAINNET,
          privateKeyProvider,
        });

        await web3authInstance.initModal();
        setWeb3auth(web3authInstance);

        // Auto-reconnect if Web3Auth has an active session
        if (web3authInstance.connected && web3authInstance.provider) {
          const web3Provider = new ethers.providers.Web3Provider(web3authInstance.provider);
          const signer = web3Provider.getSigner();
          const address = await signer.getAddress();

          const token = new ethers.Contract(CONTRACT_ADDRESSES.OOOWEEEToken, OOOWEEETokenABI, signer);
          const savings = new ethers.Contract(CONTRACT_ADDRESSES.OOOWEEESavings, OOOWEEESavingsABI, signer);
          const validatorFund = new ethers.Contract(CONTRACT_ADDRESSES.OOOWEEEValidatorFund, OOOWEEEValidatorFundABI, signer);
          const stability = new ethers.Contract(CONTRACT_ADDRESSES.OOOWEEEStability, OOOWEEEStabilityABI, signer);
          const donorRegistry = new ethers.Contract(CONTRACT_ADDRESSES.DonorRegistry, DonorRegistryABI, signer);
          const router = new ethers.Contract(UNISWAP_ROUTER, UNISWAP_ROUTER_ABI, signer);

          setAccount(address);
          setProvider(web3Provider);
          setTokenContract(token);
          setSavingsContract(savings);
          setValidatorFundContract(validatorFund);
          setDonorRegistryContract(donorRegistry);
          setStabilityContract(stability);
          setRouterContract(router);
          setLoginMethod('social');

          // Load balances and accounts on auto-reconnect
          await loadBalances(address, web3Provider, token);
          await loadSavingsAccounts(address, savings, web3Provider, router, ethPrice);
          await loadGroupAccounts(address, savings);
        }
      } catch (error) {
        console.error('Web3Auth init error:', error);
        // Non-fatal — wallet login still works
      }

      try {
        const response = await fetch('/api/eth-price');
        const data = await response.json();
        setEthPrice(data.ethereum);
        if (data._meta) {
          setPriceFeedStatus(data._meta);
          if (data._meta.source === 'live') {
            localStorage.setItem('oooweee_eth_price_cache', JSON.stringify({ prices: data.ethereum, at: Date.now() }));
          }
        }
      } catch (error) {
        console.error('Error fetching ETH price:', error);
        // Try localStorage cache before hardcoded fallback
        const cached = localStorage.getItem('oooweee_eth_price_cache');
        if (cached) {
          const { prices } = JSON.parse(cached);
          setEthPrice(prices);
          setPriceFeedStatus({ source: 'cached', error: 'Proxy unreachable', downSince: Date.now() });
        } else {
          setEthPrice({ usd: 2000, eur: 1850, gbp: 1600 });
          setPriceFeedStatus({ source: 'fallback', error: 'No cache available', downSince: Date.now() });
        }
      }
      
      setTimeout(() => setIsAppLoading(false), 1500);
    };
    
    init();
  }, []);

  // Persist selected currency
  useEffect(() => {
    localStorage.setItem('oooweee_currency', selectedCurrency);
  }, [selectedCurrency]);

  // Refresh ETH/fiat prices every 60s (CoinGecko free tier safe)
  useEffect(() => {
    const refreshEthPrice = async () => {
      try {
        const response = await fetch('/api/eth-price');
        const data = await response.json();
        if (data.ethereum) {
          setEthPrice(data.ethereum);
          if (data._meta) {
            setPriceFeedStatus(data._meta);
            if (data._meta.source === 'live') {
              localStorage.setItem('oooweee_eth_price_cache', JSON.stringify({ prices: data.ethereum, at: Date.now() }));
            }
          }
        }
      } catch (error) {
        console.error('ETH price refresh failed:', error);
        setPriceFeedStatus(prev => ({ ...prev, source: prev.source === 'live' ? 'cached' : prev.source, error: 'Refresh failed' }));
      }
    };

    const interval = setInterval(refreshEthPrice, 60000);
    return () => clearInterval(interval);
  }, []);

  // Price flash animation on OOOWEEE price change
  useEffect(() => {
    if (prevOooweeePriceRef.current !== oooweeePrice && oooweeePrice > 0 && prevOooweeePriceRef.current > 0) {
      setPriceFlash(oooweeePrice > prevOooweeePriceRef.current ? 'up' : 'down');
      prevOooweeePriceRef.current = oooweeePrice;
      const timeout = setTimeout(() => setPriceFlash(null), 1500);
      return () => clearTimeout(timeout);
    }
    prevOooweeePriceRef.current = oooweeePrice;
  }, [oooweeePrice]);

  // Format currency for user display (2 decimal places)
  const formatCurrency = (amount, currency = 'eur') => {
    const curr = Object.entries(CURRENCIES).find(([key, _]) => key.toLowerCase() === currency.toLowerCase()) || ['EUR', CURRENCIES.EUR];
    const absAmount = Math.abs(amount);
    // Use more decimal places for very small amounts (e.g. token prices < €0.01)
    let maxDecimals = 2;
    if (absAmount > 0 && absAmount < 0.01) {
      // Show enough decimals to display first significant digit + 1
      maxDecimals = Math.min(8, Math.max(4, -Math.floor(Math.log10(absAmount)) + 2));
    }
    return new Intl.NumberFormat(curr[1].locale, {
      style: 'currency',
      currency: curr[0],
      minimumFractionDigits: 2,
      maximumFractionDigits: maxDecimals
    }).format(amount);
  };

  // Update OOOWEEE price (requires login)
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

  // Update price periodically after login
  useEffect(() => {
    if (!routerContract) return;
    updateOooweeePrice();
    const interval = setInterval(updateOooweeePrice, 30000);
    return () => clearInterval(interval);
  }, [routerContract, updateOooweeePrice]);

  // Estimate OOOWEEE output (debounced)
  useEffect(() => {
    const estimateOooweee = async () => {
      if (!routerContract) return;
      const amount = parseFloat(ethToBuy);
      if (!ethToBuy || isNaN(amount) || amount <= 0) {
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

    // Debounce: wait 500ms after user stops typing
    const timeoutId = setTimeout(estimateOooweee, 500);
    return () => clearTimeout(timeoutId);
  }, [ethToBuy, routerContract]);


  // Load validator stats - with error handling
  // Batches donor lookups via Promise.all and only polls on community tab
  const loadValidatorStats = useCallback(async () => {
    if (!validatorFundContract) return;

    try {
      const [stats, ethNeeded, progressData] = await Promise.all([
        validatorFundContract.getStats(),
        validatorFundContract.ethUntilNextValidator(),
        validatorFundContract.progressToNextValidator()
      ]);

      // getStats() returns 11 values:
      // [0] totalETHReceived, [1] fromStability, [2] fromDonations,
      // [3] fromRewards, [4] pendingRewards, [5] availableForValidators,
      // [6] validatorsProvisioned, [7] validatorsActive,
      // [8] totalDistributions, [9] donorCount, [10] totalETHStaked

      // Build on-chain leaderboard — batch donor lookups via Promise.all
      const donorCount = stats[9].toNumber();
      let onChainDonors = [];

      if (donorCount > 0 && donorCount <= 100) {
        // Fetch all donor addresses in parallel
        const donorAddresses = await Promise.all(
          Array.from({ length: donorCount }, (_, i) =>
            validatorFundContract.donors(i).catch(() => null)
          )
        );
        const validAddresses = donorAddresses.filter(Boolean);

        // Fetch all donation amounts in parallel
        const donorAmounts = await Promise.all(
          validAddresses.map(addr =>
            validatorFundContract.donations(addr).catch(() => ethers.BigNumber.from(0))
          )
        );

        onChainDonors = validAddresses.map((addr, i) => ({
          address: addr,
          amount: donorAmounts[i]
        }));
      }

      // Build leaderboard — merge on-chain amounts with DonorRegistry names
      const registryRead = new ethers.Contract(
        CONTRACT_ADDRESSES.DonorRegistry,
        DonorRegistryABI,
        validatorFundContract.provider
      );

      const sortedDonors = onChainDonors
        .sort((a, b) => (b.amount.gt(a.amount) ? 1 : b.amount.lt(a.amount) ? -1 : 0))
        .slice(0, 10);

      const leaderboard = await Promise.all(
        sortedDonors.map(async (d) => {
          let name = null, message = null, location = null;
          try {
            const info = await registryRead.getDonorInfo(d.address);
            if (info.timestamp && info.timestamp.toNumber() > 0) {
              name = info.name || null;
              message = info.message || null;
              location = info.location || null;
            }
          } catch (e) {
            // DonorRegistry might not have this donor
          }
          return {
            address: d.address,
            shortAddress: `${d.address.slice(0, 6)}...${d.address.slice(-4)}`,
            name,
            message,
            location,
            amount: parseFloat(ethers.utils.formatEther(d.amount)).toFixed(4)
          };
        })
      );
      setDonorLeaderboard(leaderboard);

      const topDonor = sortedDonors.length > 0 ? sortedDonors[0].address : null;
      const topDonorAmount = sortedDonors.length > 0 ? sortedDonors[0].amount : ethers.BigNumber.from(0);

      // Dynamic progress: use required from contract (progressData[1]) instead of hardcoded 32
      const currentETH = parseFloat(ethers.utils.formatEther(progressData[0]));
      const requiredETH = parseFloat(ethers.utils.formatEther(progressData[1]));
      const progressPercent = requiredETH > 0 ? (currentETH / requiredETH) * 100 : 0;

      // totalETHStaked for new metrics
      const totalStaked = parseFloat(ethers.utils.formatEther(stats[10]));
      const ASSUMED_APR = 0.04; // 4% — update quarterly based on actual validator returns
      const saversShareOfAPR = totalStaked * ASSUMED_APR * 0.34; // 34% goes to savers

      setValidatorStats({
        validators: stats[7].toString(),
        nextValidatorIn: ethers.utils.formatEther(ethNeeded),
        progress: progressPercent,
        pendingETH: ethers.utils.formatEther(progressData[0]),
        requiredETH: requiredETH,
        totalDonations: ethers.utils.formatEther(stats[2]),
        donors: stats[9].toString(),
        fromStability: ethers.utils.formatEther(stats[1]),
        fromRewards: ethers.utils.formatEther(stats[3]),
        topDonor: topDonor,
        topDonorAmount: ethers.utils.formatEther(topDonorAmount),
        totalETHStaked: totalStaked,
        equivalentSoloValidators: (totalStaked / 32).toFixed(2),
        projectedAPRPool: saversShareOfAPR.toFixed(4)
      });
    } catch (error) {
      console.error('Error loading validator stats:', error);
    }
  }, [validatorFundContract]);

  // Load validator stats — when community or admin tab is active
  useEffect(() => {
    if (validatorFundContract && (activeTab === 'community' || activeTab === 'admin')) {
      loadValidatorStats();
      const pollInterval = activeTab === 'admin' ? 5000 : 60000;
      const interval = setInterval(loadValidatorStats, pollInterval);
      return () => clearInterval(interval);
    }
  }, [validatorFundContract, loadValidatorStats, activeTab]);

  // Calculate fiat value (frontend estimation — for display when wallet not connected)
  const getOooweeeInFiat = (oooweeeAmount, currency = 'eur') => {
    if (!ethPrice) return '...';
    const ethValue = parseFloat(oooweeeAmount) * oooweeePrice;
    const fiatValue = ethValue * (ethPrice[currency.toLowerCase()] || ethPrice.eur);
    return formatCurrency(fiatValue, currency);
  };

  // Frontend estimation: fiat to OOOWEEE (for display hints only, not transactions)
  const convertFiatToOooweee = (fiatAmount, currency = 'eur') => {
    if (!ethPrice || !fiatAmount) return 0;
    const ethValue = parseFloat(fiatAmount) / (ethPrice[currency.toLowerCase()] || ethPrice.eur);
    const oooweeeAmount = ethValue / oooweeePrice;
    return Math.floor(oooweeeAmount);
  };

  // Oracle-based: fiat to OOOWEEE (uses contract oracle — matches withdrawal logic)
  const convertFiatToOooweeeOracle = async (fiatAmount, currency = 'eur') => {
    if (!savingsContract || !fiatAmount || parseFloat(fiatAmount) <= 0) {
      return convertFiatToOooweee(fiatAmount, currency); // fallback
    }
    try {
      const currencyCode = CURRENCIES[currency.toUpperCase()]?.code ?? 1;
      const decimals = CURRENCIES[currency.toUpperCase()]?.decimals ?? 4;
      const fiatInSmallestUnit = Math.round(parseFloat(fiatAmount) * Math.pow(10, decimals));
      const tokensNeeded = await savingsContract.getFiatToTokensView(fiatInSmallestUnit, currencyCode);
      return parseFloat(ethers.utils.formatUnits(tokensNeeded, 18));
    } catch (e) {
      console.error('Oracle fiat→token conversion failed, using frontend estimate:', e);
      return convertFiatToOooweee(fiatAmount, currency);
    }
  };

  // Convert OOOWEEE to fiat
  const convertOooweeeToFiat = (oooweeeAmount, currency = 'eur') => {
    if (!ethPrice || !oooweeeAmount) return 0;
    const ethValue = parseFloat(oooweeeAmount) * oooweeePrice;
    return ethValue * (ethPrice[currency.toLowerCase()] || ethPrice.eur);
  };

  // Check if deposit meets minimum €10 requirement
  // eslint-disable-next-line no-unused-vars
  const checkMinimumDeposit = (oooweeeAmount) => {
    const fiatValue = convertOooweeeToFiat(oooweeeAmount, 'eur');
    return fiatValue >= 10; // €10 minimum
  };

  // Open buy modal with a specific amount pre-filled
  const openBuyModalWithAmount = async (neededOooweee) => {
    setRequiredOooweeeForPurchase(neededOooweee);
    // Calculate ETH needed for display
    try {
      const tokensNeeded = ethers.utils.parseUnits(Math.ceil(neededOooweee).toString(), 18);
      const path = [WETH_ADDRESS, CONTRACT_ADDRESSES.OOOWEEEToken];
      const amountsIn = await routerContract.getAmountsIn(tokensNeeded, path);
      // Add 5% buffer
      const ethNeeded = amountsIn[0].mul(105).div(100);
      setEthToBuy(ethers.utils.formatEther(ethNeeded));
    } catch (error) {
      console.error('Error calculating ETH needed:', error);
    }
    setShowBuyModal(true);
  };

  // Buy OOOWEEE with ETH
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

  // Helper function to get currency code from enum value
  const getCurrencyFromCode = useCallback((code) => {
    const codes = ['USD', 'EUR', 'GBP'];
    return codes[code] || 'EUR';
  }, []);

  const calculateProgress = useCallback((acc, currentOooweeePrice, currentEthPrice) => {
    if (acc.type === 'Time') {
      const now = Math.floor(Date.now() / 1000);
      const created = acc.createdAt || now;
      const unlock = acc.unlockTime;
      if (unlock <= now) return 100;
      const total = unlock - created;
      const elapsed = now - created;
      return Math.min(100, Math.floor((elapsed / total) * 100));
    }

    if (acc.isFiatTarget && acc.targetFiat > 0) {
      if (acc.currentFiatValue && acc.currentFiatValue > 0) {
        const progress = (acc.currentFiatValue / acc.targetFiat) * 100;
        return Math.min(100, Math.floor(progress));
      }

      const currencyCode = getCurrencyFromCode(acc.targetCurrency);
      const currencyInfo = CURRENCIES[currencyCode.toUpperCase()] || CURRENCIES.EUR;
      const ethPriceForCurrency = currentEthPrice?.[currencyCode.toLowerCase()] || currentEthPrice?.eur || 1850;
      const tokenValueInEth = parseFloat(acc.balance) * currentOooweeePrice;
      const currentFiatValue = tokenValueInEth * ethPriceForCurrency;
      const targetFiatValue = acc.targetFiat / Math.pow(10, currencyInfo.decimals);

      if (targetFiatValue <= 0) return 0;
      return Math.min(100, Math.floor((currentFiatValue / targetFiatValue) * 100));
    }

    if (parseFloat(acc.target) > 0) {
      return Math.min(100, Math.floor((parseFloat(acc.balance) / parseFloat(acc.target)) * 100));
    }

    return 0;
  }, [getCurrencyFromCode]);

  const loadBalances = useCallback(async (userAccount, providerInstance, tokenContractInstance) => {
    try {
      const [tokenBal, ethBal] = await Promise.all([
        tokenContractInstance.balanceOf(userAccount),
        providerInstance.getBalance(userAccount)
      ]);

      setBalance(ethers.utils.formatUnits(tokenBal, 18));
      setEthBalance(ethers.utils.formatEther(ethBal));
    } catch (error) {
      console.error('Error loading balances:', error);
    }
  }, []);

  const loadSavingsAccounts = useCallback(async (userAccount, savingsContractInstance, providerInstance, routerContractInstance, currentEthPrice) => {
    try {
      let freshOooweeePrice = 0.00001;

      if (routerContractInstance) {
        try {
          const ethAmount = ethers.utils.parseEther("1");
          const path = [WETH_ADDRESS, CONTRACT_ADDRESSES.OOOWEEEToken];
          const amounts = await routerContractInstance.getAmountsOut(ethAmount, path);
          const oooweeePerEth = parseFloat(ethers.utils.formatUnits(amounts[1], 18));
          freshOooweeePrice = 1 / oooweeePerEth;
          setOooweeePrice(freshOooweeePrice);
        } catch (priceError) {
          console.error('Error fetching fresh OOOWEEE price:', priceError);
        }
      }

      let freshEthPrice = currentEthPrice;
      if (!freshEthPrice) {
        try {
          const response = await fetch('/api/eth-price');
          const data = await response.json();
          freshEthPrice = data.ethereum;
          setEthPrice(freshEthPrice);
        } catch (e) {
          freshEthPrice = { usd: 2000, eur: 1850, gbp: 1600 };
        }
      }

      const [totalCount] = await savingsContractInstance.getUserAccountCount(userAccount);
      const accountDetails = [];

      const ACCOUNT_TYPES = ['Time', 'Balance', 'Growth'];
      const CURRENCY_CODES_LOCAL = ['USD', 'EUR', 'GBP'];

      // Pre-fetch closing balances from events for completed accounts
      let closingBalances = {};
      try {
        const currentBlock = await providerInstance.getBlockNumber();
        // Search from deploy block, but chunk to avoid RPC range limits (50k blocks)
        const startBlock = 24430000;
        const chunkSize = 49000;
        const goalFilter = savingsContractInstance.filters.GoalCompleted(userAccount, null);
        const autoFilter = savingsContractInstance.filters.AutoUnlockProcessed(userAccount, null);

        for (let from = startBlock; from <= currentBlock; from += chunkSize) {
          const to = Math.min(from + chunkSize - 1, currentBlock);
          const [goalEvents, autoEvents] = await Promise.all([
            savingsContractInstance.queryFilter(goalFilter, from, to),
            savingsContractInstance.queryFilter(autoFilter, from, to)
          ]);
          // GoalCompleted: tokensReturned + feeCollected = total closing balance
          for (const evt of goalEvents) {
            const accId = evt.args.accountId.toString();
            const tokensReturned = evt.args.tokensReturned;
            const feeCollected = evt.args.feeCollected;
            closingBalances[accId] = tokensReturned.add(feeCollected);
          }
          // AutoUnlockProcessed: amount is total balance before fee
          for (const evt of autoEvents) {
            const accId = evt.args.accountId.toString();
            closingBalances[accId] = evt.args.amount;
          }
        }
      } catch (evtErr) {
        console.error('Error fetching closing balance events:', evtErr);
      }

      for (let id = 0; id < totalCount.toNumber(); id++) {
        try {
          const info = await savingsContractInstance.getAccountDetails(userAccount, id);

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
            createdAt: info[9].toNumber(),
            pendingRewards: '0',
            isFiatTarget: info[4].gt(0)
          };

          // For completed accounts, use closing balance from events
          const closingBal = closingBalances[accData.id];
          if (!accData.isActive && closingBal && closingBal.gt(0)) {
            accData.balance = ethers.utils.formatUnits(closingBal, 18);
            accData.closingBalance = true;
          }

          // Always compute fiat value via contract oracle for consistent pricing
          try {
            const balanceWei = ethers.utils.parseUnits(accData.balance, 18);
            const contractFiatValue = await savingsContractInstance.getBalanceInFiatView(balanceWei, accData.targetCurrency);
            accData.currentFiatValue = contractFiatValue.toNumber();
          } catch (e) {
            console.error('Error getting contract fiat value:', e);
            const currencyCode = CURRENCY_CODES_LOCAL[accData.targetCurrency] || 'EUR';
            const ethPriceForCurrency = freshEthPrice?.[currencyCode.toLowerCase()] || freshEthPrice?.eur || 1850;
            const tokenValueInEth = parseFloat(accData.balance) * freshOooweeePrice;
            const decimals = CURRENCIES[currencyCode.toUpperCase()]?.decimals || 8;
            accData.currentFiatValue = Math.floor(tokenValueInEth * ethPriceForCurrency * Math.pow(10, decimals));
          }

          accData.progress = calculateProgress(accData, freshOooweeePrice, freshEthPrice);
          accountDetails.push(accData);
        } catch (error) {
          console.error(`Error loading account ${id}:`, error);
        }
      }

      setAccounts(accountDetails);

      // Compute wallet balance fiat values using oracle (same source as account cards)
      try {
        const tokenContractForBalance = new ethers.Contract(CONTRACT_ADDRESSES.OOOWEEEToken, OOOWEEETokenABI, providerInstance);
        const walletTokenBal = await tokenContractForBalance.balanceOf(userAccount);
        if (walletTokenBal.gt(0)) {
          const [usdVal, eurVal, gbpVal] = await Promise.all([
            savingsContractInstance.getBalanceInFiatView(walletTokenBal, 0), // USD
            savingsContractInstance.getBalanceInFiatView(walletTokenBal, 1), // EUR
            savingsContractInstance.getBalanceInFiatView(walletTokenBal, 2), // GBP
          ]);
          setBalanceFiat({ usd: usdVal.toNumber(), eur: eurVal.toNumber(), gbp: gbpVal.toNumber() });
        } else {
          setBalanceFiat({ usd: 0, eur: 0, gbp: 0 });
        }
      } catch (e) {
        console.error('Error computing wallet fiat balance:', e);
      }
    } catch (error) {
      console.error('Error loading accounts:', error);
    }
  }, [calculateProgress]);

  const handleAccountsChanged = useCallback(async (accounts) => {
    if (accounts.length === 0) {
      // Full page reload to reset all state cleanly
      window.location.reload();
    } else {
      window.location.reload();
    }
  }, []);

  const handleChainChanged = useCallback(() => {
    window.location.reload();
  }, []);

  // Buy and create account - FIXED: Buy exactly the needed amount
  // eslint-disable-next-line no-unused-vars
  const buyAndCreateAccount = async (requiredOooweee) => {
    const result = await toast.promise(
      new Promise(async (resolve, reject) => {
        try {
          setLoading(true);

          // Calculate exact tokens needed (rounded up)
          const tokensNeeded = ethers.utils.parseUnits(Math.ceil(requiredOooweee).toString(), 18);
          const path = [WETH_ADDRESS, CONTRACT_ADDRESSES.OOOWEEEToken];
          const deadline = Math.floor(Date.now() / 1000) + 3600;

          // Get ETH needed for exact token amount using getAmountsIn
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

          await tx.wait();
          await loadBalances(account, provider, tokenContract);
          resolve(true);
        } catch (error) {
          reject(error);
        }
      }),
      {
        loading: `🔄 Buying ${Math.ceil(requiredOooweee).toLocaleString()} OOOWEEE...`,
        success: '✅ OOOWEEE purchased! Creating account...',
        error: '❌ Failed to buy OOOWEEE'
      }
    );

    return result;
  };

  // Connect wallet - FIX: Prevent duplicate connections
  const connectWallet = useCallback(async () => {
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
      if (network.chainId !== 1) {
        toast.error('Please switch to Ethereum Mainnet');
        setLoading(false);
        setIsConnecting(false);
        return;
      }

      // Initialize contracts
      const token = new ethers.Contract(CONTRACT_ADDRESSES.OOOWEEEToken, OOOWEEETokenABI, signer);
      const savings = new ethers.Contract(CONTRACT_ADDRESSES.OOOWEEESavings, OOOWEEESavingsABI, signer);
      const validatorFund = new ethers.Contract(CONTRACT_ADDRESSES.OOOWEEEValidatorFund, OOOWEEEValidatorFundABI, signer);
      const stability = new ethers.Contract(CONTRACT_ADDRESSES.OOOWEEEStability, OOOWEEEStabilityABI, signer);
      const donorRegistry = new ethers.Contract(CONTRACT_ADDRESSES.DonorRegistry, DonorRegistryABI, signer);
      const router = new ethers.Contract(UNISWAP_ROUTER, UNISWAP_ROUTER_ABI, signer);

      setAccount(address);
      setProvider(web3Provider);
      setTokenContract(token);
      setSavingsContract(savings);
      setValidatorFundContract(validatorFund);
      setDonorRegistryContract(donorRegistry);
      setStabilityContract(stability);
      setRouterContract(router);

      // Load user data (read-only operations)
      await loadBalances(address, web3Provider, token);
      await loadSavingsAccounts(address, savings, web3Provider, router, ethPrice);
      await loadGroupAccounts(address, savings);

      // Subscribe to events
      if (instance.on) {
        instance.on("accountsChanged", handleAccountsChanged);
        instance.on("chainChanged", handleChainChanged);
      }

      setLoginMethod('wallet');
      toast.success('Wallet connected!');

      // Show intro for first-time users
      if (!localStorage.getItem('oooweee_intro_seen')) {
        setIntroStep(0);
        setShowIntro(true);
      }
    } catch (error) {
      console.error(error);
      if (error.message !== 'User closed modal') {
        toast.error('Failed to connect wallet');
      }
    } finally {
      setLoading(false);
      setIsConnecting(false);
    }
  }, [web3Modal, isConnecting, ethPrice, handleAccountsChanged, handleChainChanged, loadBalances, loadSavingsAccounts]);

  // Social login via Web3Auth (Google / Email)
  const connectSocialLogin = async () => {
    if (isConnecting || !web3auth) return;

    try {
      setIsConnecting(true);
      setLoading(true);

      const web3authProvider = await web3auth.connect();

      if (!web3authProvider) {
        throw new Error('No provider returned from Web3Auth');
      }

      const web3Provider = new ethers.providers.Web3Provider(web3authProvider);
      const signer = web3Provider.getSigner();
      const address = await signer.getAddress();

      // Initialize contracts (same as wallet flow)
      const token = new ethers.Contract(CONTRACT_ADDRESSES.OOOWEEEToken, OOOWEEETokenABI, signer);
      const savings = new ethers.Contract(CONTRACT_ADDRESSES.OOOWEEESavings, OOOWEEESavingsABI, signer);
      const validatorFund = new ethers.Contract(CONTRACT_ADDRESSES.OOOWEEEValidatorFund, OOOWEEEValidatorFundABI, signer);
      const stability = new ethers.Contract(CONTRACT_ADDRESSES.OOOWEEEStability, OOOWEEEStabilityABI, signer);
      const donorRegistry = new ethers.Contract(CONTRACT_ADDRESSES.DonorRegistry, DonorRegistryABI, signer);
      const router = new ethers.Contract(UNISWAP_ROUTER, UNISWAP_ROUTER_ABI, signer);

      setAccount(address);
      setProvider(web3Provider);
      setTokenContract(token);
      setSavingsContract(savings);
      setValidatorFundContract(validatorFund);
      setDonorRegistryContract(donorRegistry);
      setStabilityContract(stability);
      setRouterContract(router);
      setLoginMethod('social');

      await loadBalances(address, web3Provider, token);
      await loadSavingsAccounts(address, savings, web3Provider, router, ethPrice);

      toast.success('Signed in successfully!');

      // Show intro for first-time users
      if (!localStorage.getItem('oooweee_intro_seen')) {
        setIntroStep(0);
        setShowIntro(true);
      }
    } catch (error) {
      console.error('Social login error:', error);
      if (error.message !== 'User closed popup' && error.message !== 'user closed popup') {
        toast.error('Failed to sign in');
      }
    } finally {
      setLoading(false);
      setIsConnecting(false);
    }
  };

  // Auto-reconnect wallet if cached - one-shot on mount
  useEffect(() => {
    if (hasAutoReconnected.current) return;
    if (web3Modal && web3Modal.cachedProvider && !account && !isConnecting) {
      hasAutoReconnected.current = true;
      connectWallet();
    }
  }, [web3Modal, account, isConnecting, connectWallet]);

  const donateToValidators = async () => {
    setShowDonateModal(true);
  };

  // Fiat onramp — buy ETH with card / Google Pay / Apple Pay
  const openFiatOnramp = () => {
    if (!account) {
      toast.error('Please connect your wallet first');
      return;
    }

    const transakUrl = new URL('https://global.transak.com');
    transakUrl.searchParams.set('apiKey', TRANSAK_API_KEY);
    transakUrl.searchParams.set('environment', 'PRODUCTION');
    transakUrl.searchParams.set('cryptoCurrencyCode', 'ETH');
    transakUrl.searchParams.set('network', 'ethereum');
    transakUrl.searchParams.set('defaultCryptoCurrency', 'ETH');
    transakUrl.searchParams.set('walletAddress', account);
    transakUrl.searchParams.set('fiatCurrency', selectedCurrency);
    transakUrl.searchParams.set('defaultFiatAmount', '50');
    transakUrl.searchParams.set('themeColor', '7B68EE');
    transakUrl.searchParams.set('disableWalletAddressForm', 'true');

    // Open in a popup window
    const width = 450;
    const height = 700;
    const left = (window.innerWidth - width) / 2 + window.screenX;
    const top = (window.innerHeight - height) / 2 + window.screenY;
    window.open(
      transakUrl.toString(),
      'transak_widget',
      `width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes`
    );

    toast('ETH purchase window opened! Your balance will update after the purchase completes.', { icon: '💳', duration: 5000 });

    // Poll for balance changes after opening widget
    // Clear any previous polling interval to prevent stacking
    if (fiatOnrampPollRef.current) {
      clearInterval(fiatOnrampPollRef.current);
    }
    fiatOnrampPollRef.current = setInterval(async () => {
      if (provider && tokenContract && account) {
        await loadBalances(account, provider, tokenContract);
      }
    }, 15000);

    // Stop polling after 10 minutes
    const currentInterval = fiatOnrampPollRef.current;
    setTimeout(() => {
      clearInterval(currentInterval);
      if (fiatOnrampPollRef.current === currentInterval) {
        fiatOnrampPollRef.current = null;
      }
    }, 600000);
  };

  const handleDonateSubmit = async () => {
    if (!donateAmount || parseFloat(donateAmount) <= 0) {
      toast.error('Enter a valid ETH amount');
      return;
    }
    
    try {
      setLoading(true);
      const amount = parseFloat(donateAmount);
      const isSponsor = amount >= 0.05;
      const hasMetadata = isSponsor && (donorName.trim() || donorMessage.trim() || donorLocation.trim());
      let donationWei = ethers.utils.parseEther(donateAmount);
      let registrationCostWei = ethers.BigNumber.from(0);

      // Sponsor tier (0.05+ ETH): estimate registration gas cost
      // and subtract it from the donation so total spend = donateAmount
      if (donorRegistryContract && hasMetadata) {
        try {
          const gasEstimate = await donorRegistryContract.estimateGas.registerDonation(
            donorName.trim().slice(0, 50) || 'Anonymous',
            donorMessage.trim().slice(0, 180),
            donorLocation.trim().slice(0, 50)
          );
          const gasPrice = await provider.getGasPrice();
          registrationCostWei = gasEstimate.mul(gasPrice).mul(120).div(100); // 20% buffer
          donationWei = donationWei.sub(registrationCostWei);
          if (donationWei.lte(0)) {
            toast.error('Donation amount too small to cover registration gas');
            setLoading(false);
            return;
          }
        } catch (e) {
          // Can't estimate — just send full amount as donation, skip registration
          console.warn('Could not estimate registration gas:', e);
          registrationCostWei = ethers.BigNumber.from(0);
          donationWei = ethers.utils.parseEther(donateAmount);
        }
      }

      const actualDonation = ethers.utils.formatEther(donationWei);
      const tx = await validatorFundContract.donate({ value: donationWei });

      await toast.promise(tx.wait(), {
        loading: '💰 Sending donation...',
        success: `🎉 Donated ${parseFloat(actualDonation).toFixed(4)} ETH to validator fund!`,
        error: '❌ Donation failed'
      });

      // Register donor metadata on-chain (gas already budgeted from donation amount)
      if (donorRegistryContract && hasMetadata) {
        try {
          const regTx = await donorRegistryContract.registerDonation(
            donorName.trim().slice(0, 50) || 'Anonymous',
            donorMessage.trim().slice(0, 180),
            donorLocation.trim().slice(0, 50)
          );
          await toast.promise(regTx.wait(), {
            loading: '📝 Saving your name on-chain...',
            success: '✅ Name & message saved!',
            error: '⚠️ Name save failed'
          });
        } catch (regError) {
          console.error('Donor registration failed:', regError);
          if (regError.code !== 'ACTION_REJECTED') {
            toast('Donation sent! Name save failed — try again next time', { icon: '⚠️' });
          }
        }
      }

      // Save shoutout locally for immediate display
      if (donorMessage.trim()) {
        const newShoutout = {
          message: donorMessage.trim().slice(0, 180),
          amount: donateAmount,
          name: donorName.trim().slice(0, 50) || null,
          location: donorLocation.trim().slice(0, 50) || null,
          sender: `${account.slice(0, 6)}...${account.slice(-4)}`,
          timestamp: Date.now()
        };
        setDonorShoutout(newShoutout);
        localStorage.setItem('oooweee_donor_shoutout', JSON.stringify(newShoutout));
      }
      
      await loadValidatorStats();
      setShowDonateModal(false);
      setDonateAmount('0.05');
      setDonorMessage('');
      setDonorName('');
      setDonorLocation('');
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
  };

  const disconnectWallet = async () => {
    // Logout from Web3Auth if social login
    if (loginMethod === 'social' && web3auth) {
      try {
        await web3auth.logout();
      } catch (e) {
        console.error('Web3Auth logout error:', e);
      }
    }

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
    setDonorRegistryContract(null);
    setStabilityContract(null);
    setRouterContract(null);
    setBalance('0');
    setEthBalance('0');
    setAccounts([]);
    setLoginMethod(null);
  };

  // eslint-disable-next-line no-unused-vars
  const claimRewards = async (accountId) => {
    try {
      setLoading(true);
      const tx = await savingsContract.claimRewards(accountId);

      await toast.promise(tx.wait(), {
        loading: '🎁 Claiming rewards...',
        success: '✅ Rewards claimed!',
        error: '❌ Failed to claim rewards'
      });

      await loadSavingsAccounts(account, savingsContract, provider, routerContract, ethPrice);

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
      
      await loadSavingsAccounts(account, savingsContract, provider, routerContract, ethPrice);
      
    } catch (error) {
      console.error(error);
      toast.error('Failed to claim rewards');
    } finally {
      setLoading(false);
    }
  };

  // ============ Group Savings Functions ============

  const loadGroupAccounts = async (userAccount, contract) => {
    try {
      const count = await contract.groupCount();
      const groupsList = [];
      for (let i = 0; i < count.toNumber(); i++) {
        try {
          const memberCheck = await contract.isGroupMember(i, userAccount);
          const inviteCheck = await contract.isGroupInvited(i, userAccount);
          if (memberCheck || inviteCheck) {
            const details = await contract.getGroupDetails(i);
            const members = await contract.getGroupMembers(i);
            const myContribution = memberCheck
              ? await contract.getGroupContribution(i, userAccount)
              : ethers.BigNumber.from(0);
            // Sum all member contributions (shows total even after completion)
            let totalContributions = ethers.BigNumber.from(0);
            for (const member of members) {
              try {
                const contrib = await contract.getGroupContribution(i, member);
                totalContributions = totalContributions.add(contrib);
              } catch (e) {}
            }
            const TYPES = ['Time', 'Balance', 'Growth'];
            const displayBalance = details.isActive
              ? ethers.utils.formatUnits(details.totalBalance, 18)
              : ethers.utils.formatUnits(totalContributions, 18);
            groupsList.push({
              id: i,
              creator: details.creator,
              destinationWallet: details.destinationWallet,
              accountType: TYPES[details.accountType] || 'Time',
              isActive: details.isActive,
              totalBalance: ethers.utils.formatUnits(details.totalBalance, 18),
              totalContributions: ethers.utils.formatUnits(totalContributions, 18),
              displayBalance: displayBalance,
              targetFiat: details.targetFiat.toString(),
              targetCurrency: details.targetCurrency,
              unlockTime: details.unlockTime,
              goalName: details.goalName,
              memberCount: details.memberCount.toNumber(),
              members: members,
              myContribution: ethers.utils.formatUnits(myContribution, 18),
              isMember: memberCheck,
              isInvited: inviteCheck && !memberCheck
            });
          }
        } catch (e) {
          console.error('Error loading group', i, e);
        }
      }
      setUserGroups(groupsList);
      setPendingInvitations(groupsList.filter(g => g.isInvited));
    } catch (error) {
      console.error('Error loading groups:', error);
    }
  };

  const inviteMemberToGroup = async (groupId, memberAddress) => {
    try {
      setLoading(true);
      if (!ethers.utils.isAddress(memberAddress)) {
        toast.error('Invalid address');
        return;
      }
      const tx = await savingsContract.inviteMember(groupId, memberAddress);
      await toast.promise(tx.wait(), {
        loading: '📨 Sending invitation...',
        success: '✅ Member invited!',
        error: '❌ Failed to invite'
      });
      setGroupInviteAddress('');
      await loadGroupAccounts(account, savingsContract);
    } catch (error) {
      console.error(error);
      toast.error('Failed to invite: ' + (error.reason || error.message));
    } finally {
      setLoading(false);
    }
  };

  const acceptGroupInvitation = async (groupId) => {
    try {
      setLoading(true);
      const tx = await savingsContract.acceptInvitation(groupId);
      await toast.promise(tx.wait(), {
        loading: '🤝 Accepting invitation...',
        success: '✅ You joined the group!',
        error: '❌ Failed to accept'
      });
      await loadGroupAccounts(account, savingsContract);
    } catch (error) {
      console.error(error);
      toast.error('Failed to accept: ' + (error.reason || error.message));
    } finally {
      setLoading(false);
    }
  };

  // Helper: approve tokens and wait for state propagation before next contract call
  // Fixes race condition where gas estimation fails because node hasn't indexed approval yet
  const approveAndWait = async (spender, amount) => {
    const approveTx = await tokenContract.approve(spender, amount);
    await toast.promise(approveTx.wait(), {
      loading: '🔓 Approving tokens...',
      success: '✅ Tokens approved!',
      error: '❌ Failed to approve'
    });
    // Wait for node state propagation to prevent gas estimation failures
    await new Promise(resolve => setTimeout(resolve, 2000));
  };

  // Helper: execute a contract call with retry on gas estimation failure
  const executeWithRetry = async (contractCall, toastMessages, retries = 2) => {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const tx = await contractCall();
        await toast.promise(tx.wait(), toastMessages);
        return;
      } catch (error) {
        const isGasError = error.code === 'UNPREDICTABLE_GAS_LIMIT' ||
                           error.message?.includes('cannot estimate gas') ||
                           error.message?.includes('gas required exceeds') ||
                           error.code === -32603;
        if (isGasError && attempt < retries) {
          toast('Retrying transaction...', { icon: '🔄' });
          await new Promise(resolve => setTimeout(resolve, 3000));
          continue;
        }
        throw error;
      }
    }
  };

  const depositToGroupAccount = async (groupId, oooweeeAmount) => {
    try {
      setLoading(true);
      const depositAmount = ethers.utils.parseUnits(Math.floor(parseFloat(oooweeeAmount)).toString(), 18);

      await approveAndWait(CONTRACT_ADDRESSES.OOOWEEESavings, depositAmount);

      await executeWithRetry(
        () => savingsContract.depositToGroup(groupId, depositAmount),
        { loading: '💰 Depositing to group...', success: '✅ Deposit successful!', error: '❌ Failed to deposit' }
      );

      setGroupDepositAmount('');
      await loadGroupAccounts(account, savingsContract);
      await loadBalances(account, provider, tokenContract);
    } catch (error) {
      console.error(error);
      if (error.code === 'ACTION_REJECTED') {
        toast.error('Transaction cancelled');
      } else {
        toast.error('Failed to deposit: ' + (error.reason || error.message));
      }
    } finally {
      setLoading(false);
    }
  };

  const processGroup = async (groupId) => {
    try {
      setLoading(true);
      const tx = await savingsContract.processGroupAccount(groupId);
      await toast.promise(tx.wait(), {
        loading: '🏁 Completing group account...',
        success: '🎉 Group account completed! Funds sent to destination.',
        error: '❌ Conditions not met yet'
      });
      await loadGroupAccounts(account, savingsContract);
    } catch (error) {
      console.error(error);
      toast.error('Cannot complete: ' + (error.reason || error.message));
    } finally {
      setLoading(false);
    }
  };

  const createTimeAccount = async (unlockDate, goalName, initialDeposit, currency) => {
    try {
      setLoading(true);
      
      // initialDeposit is already in OOOWEEE (converted from fiat in handleCreateAccount)
      if (parseFloat(balance) < parseFloat(initialDeposit)) {
        const needed = parseFloat(initialDeposit) - parseFloat(balance);
        
        // Open buy modal with exact amount needed
        toast(`You need ${Math.ceil(needed).toLocaleString()} more OOOWEEE`, { icon: '💡' });
        await openBuyModalWithAmount(needed);
        setLoading(false);
        return;
      }
      
      const unlockTime = Math.floor(new Date(unlockDate).getTime() / 1000);
      const depositAmount = ethers.utils.parseUnits(Math.ceil(parseFloat(initialDeposit)).toString(), 18);
      
      await approveAndWait(CONTRACT_ADDRESSES.OOOWEEESavings, depositAmount);

      await executeWithRetry(
        () => savingsContract.createTimeAccount(unlockTime, goalName, depositAmount, CURRENCIES[currency].code),
        { loading: '🐷 Creating piggy bank...', success: `🎉 Time account created with ${Math.ceil(parseFloat(initialDeposit)).toLocaleString()} $OOOWEEE!`, error: '❌ Failed to create account' }
      );
      
      await loadSavingsAccounts(account, savingsContract, provider, routerContract, ethPrice);
      await loadBalances(account, provider, tokenContract);
    } catch (error) {
      console.error(error);
      if (error.code === 'ACTION_REJECTED') {
        toast.error('Transaction cancelled');
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
      
      // initialDeposit is already in OOOWEEE (converted from fiat in handleCreateAccount)
      // Target validation is done in handleCreateAccount
      
      if (parseFloat(balance) < parseFloat(initialDeposit)) {
        const needed = parseFloat(initialDeposit) - parseFloat(balance);
        
        // Open buy modal with exact amount needed
        toast(`You need ${Math.ceil(needed).toLocaleString()} more OOOWEEE`, { icon: '💡' });
        await openBuyModalWithAmount(needed);
        setLoading(false);
        return;
      }
      
      const targetInSmallestUnit = Math.round(targetAmount * Math.pow(10, CURRENCIES[currency].decimals));
      const depositAmount = ethers.utils.parseUnits(Math.ceil(parseFloat(initialDeposit)).toString(), 18);
      
      await approveAndWait(CONTRACT_ADDRESSES.OOOWEEESavings, depositAmount);

      await executeWithRetry(
        () => savingsContract.createGrowthAccount(targetInSmallestUnit, CURRENCIES[currency].code, goalName, depositAmount),
        { loading: '🌱 Planting money tree...', success: `🎉 Growth account created! Target: ${CURRENCIES[currency].symbol}${targetAmount}`, error: '❌ Failed to create account' }
      );
      
      await loadSavingsAccounts(account, savingsContract, provider, routerContract, ethPrice);
      await loadBalances(account, provider, tokenContract);
    } catch (error) {
      console.error(error);
      if (error.code === 'ACTION_REJECTED') {
        toast.error('Transaction cancelled');
      } else if (error.reason?.includes('Target must be higher')) {
        toast.error('Target must be higher than initial deposit value');
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
      
      // initialDeposit is already in OOOWEEE (converted from fiat in handleCreateAccount)
      if (parseFloat(balance) < parseFloat(initialDeposit)) {
        const needed = parseFloat(initialDeposit) - parseFloat(balance);
        
        // Open buy modal with exact amount needed
        toast(`You need ${Math.ceil(needed).toLocaleString()} more OOOWEEE`, { icon: '💡' });
        await openBuyModalWithAmount(needed);
        setLoading(false);
        return;
      }
      
      const targetInSmallestUnit = Math.round(targetAmount * Math.pow(10, CURRENCIES[currency].decimals));
      const depositAmount = ethers.utils.parseUnits(Math.ceil(parseFloat(initialDeposit)).toString(), 18);
      
      await approveAndWait(CONTRACT_ADDRESSES.OOOWEEESavings, depositAmount);

      await executeWithRetry(
        () => savingsContract.createBalanceAccount(targetInSmallestUnit, CURRENCIES[currency].code, recipientAddress, goalName, depositAmount),
        { loading: '⚖️ Setting up balance account...', success: `🎉 Balance account created! Will send to ${recipientAddress.slice(0,6)}...`, error: '❌ Failed to create account' }
      );
      
      await loadSavingsAccounts(account, savingsContract, provider, routerContract, ethPrice);
      await loadBalances(account, provider, tokenContract);
    } catch (error) {
      console.error(error);
      if (error.code === 'ACTION_REJECTED') {
        toast.error('Transaction cancelled');
      } else {
        toast.error('Failed to create account: ' + (error.reason || error.message));
      }
    } finally {
      setLoading(false);
    }
  };

  const handleCreateAccount = async () => {
    const goalName = document.getElementById('goalName')?.value;
    const initialDepositFiat = document.getElementById('initialDeposit')?.value;
    
    if (!goalName) {
      toast.error('Please enter an account name');
      return;
    }
    
    if (!initialDepositFiat || parseFloat(initialDepositFiat) <= 0) {
      toast.error('Please enter an initial deposit amount');
      return;
    }
    
    // Check minimum deposit in EUR equivalent
    const depositInEur = accountCurrency === 'EUR' 
      ? parseFloat(initialDepositFiat)
      : parseFloat(initialDepositFiat) * (ethPrice?.eur || 1850) / (ethPrice?.[accountCurrency.toLowerCase()] || 1850);
    
    if (depositInEur < 10) {
      toast.error('Minimum deposit is €10 equivalent');
      return;
    }
    
    // Convert fiat deposit to OOOWEEE using contract oracle (matches withdrawal logic)
    const initialDepositOooweee = await convertFiatToOooweeeOracle(initialDepositFiat, accountCurrency.toLowerCase());

    if (initialDepositOooweee <= 0) {
      toast.error('Deposit amount too small');
      return;
    }

    if (accountType === 'time') {
      const unlockDate = document.getElementById('unlockDate')?.value;
      if (!unlockDate) {
        toast.error('Please select an unlock date');
        return;
      }
      createTimeAccount(unlockDate, goalName, initialDepositOooweee, accountCurrency);
    } else if (accountType === 'growth') {
      const targetAmount = document.getElementById('targetAmount')?.value;
      if (!targetAmount || targetAmount <= 0) {
        toast.error('Please enter a valid target amount');
        return;
      }
      // Validate target > deposit (both in fiat)
      if (parseFloat(initialDepositFiat) >= parseFloat(targetAmount)) {
        toast.error('Target must be higher than initial deposit');
        return;
      }
      createGrowthAccount(targetAmount, goalName, initialDepositOooweee, accountCurrency);
    } else if (accountType === 'balance') {
      const targetAmount = document.getElementById('targetAmount')?.value;
      const recipientAddress = document.getElementById('recipientAddress')?.value;
      if (!targetAmount || targetAmount <= 0) {
        toast.error('Please enter a valid target amount');
        return;
      }
      if (!recipientAddress) {
        toast.error('Please enter a recipient address');
        return;
      }
      createBalanceAccount(targetAmount, recipientAddress, goalName, initialDepositOooweee, accountCurrency);
    } else if (accountType === 'group') {
      if (!groupDestination || !ethers.utils.isAddress(groupDestination)) {
        toast.error('Please enter a valid destination wallet address');
        return;
      }
      const ACCOUNT_TYPE_MAP = { time: 0, balance: 1, growth: 2 };
      const CURRENCY_MAP = { USD: 0, EUR: 1, GBP: 2 };
      const typeEnum = ACCOUNT_TYPE_MAP[groupSubType] || 0;
      const currencyEnum = CURRENCY_MAP[accountCurrency] || 1;

      let unlockTime = 0;
      let targetFiatSmallest = 0;

      if (groupSubType === 'time') {
        const unlockDate = document.getElementById('unlockDate')?.value;
        if (!unlockDate) {
          toast.error('Please select an unlock date');
          return;
        }
        unlockTime = Math.floor(new Date(unlockDate).getTime() / 1000);
      } else {
        const targetAmount = document.getElementById('targetAmount')?.value;
        if (!targetAmount || parseFloat(targetAmount) <= 0) {
          toast.error('Please enter a valid target amount');
          return;
        }
        targetFiatSmallest = Math.round(parseFloat(targetAmount) * Math.pow(10, CURRENCIES[accountCurrency].decimals));
      }

      createGroupAccountFn(typeEnum, groupDestination, goalName, targetFiatSmallest, currencyEnum, unlockTime, initialDepositOooweee);
    }
  };

  const createGroupAccountFn = async (typeEnum, destination, goalName, targetFiat, currencyEnum, unlockTime, initialDeposit) => {
    try {
      setLoading(true);

      if (parseFloat(balance) < parseFloat(initialDeposit)) {
        const needed = parseFloat(initialDeposit) - parseFloat(balance);
        toast(`You need ${Math.ceil(needed).toLocaleString()} more OOOWEEE`, { icon: '💡' });
        await openBuyModalWithAmount(needed);
        setLoading(false);
        return;
      }

      const depositAmount = ethers.utils.parseUnits(Math.floor(initialDeposit).toString(), 18);

      await approveAndWait(CONTRACT_ADDRESSES.OOOWEEESavings, depositAmount);

      await executeWithRetry(
        () => savingsContract.createGroupAccount(typeEnum, destination, goalName, targetFiat, currencyEnum, unlockTime, depositAmount),
        { loading: '👥 Creating group account...', success: '🎉 Group account created!', error: '❌ Failed to create group account' }
      );

      await loadGroupAccounts(account, savingsContract);
      await loadBalances(account, provider, tokenContract);
    } catch (error) {
      console.error(error);
      if (error.code === 'ACTION_REJECTED') {
        toast.error('Transaction cancelled');
      } else {
        toast.error('Failed to create group: ' + (error.reason || error.message));
      }
    } finally {
      setLoading(false);
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
      const formattedTokens = Number(depositAmountNumber).toLocaleString(undefined, { maximumFractionDigits: 0 });

      await approveAndWait(CONTRACT_ADDRESSES.OOOWEEESavings, depositAmount);

      await executeWithRetry(
        () => savingsContract.deposit(accountId, depositAmount),
        { loading: `💰 Depositing ${formattedTokens} $OOOWEEE...`, success: `🎉 Deposited ${formattedTokens} $OOOWEEE!`, error: '❌ Failed to deposit' }
      );
      
      // CRITICAL: Pass all required params including routerContract for fresh price fetch
      await loadSavingsAccounts(account, savingsContract, provider, routerContract, ethPrice);
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

  // Manual withdrawal for matured accounts
  const manualWithdraw = async (accountId, goalName) => {
    try {
      setLoading(true);

      // First verify eligibility via view function
      const eligible = await savingsContract.canWithdraw(account, accountId);
      if (!eligible) {
        toast.error('Account not yet eligible for withdrawal');
        setLoading(false);
        return;
      }

      // Use manual gas limit — the oracle's TWAP update can cause gas estimation
      // to fail even though the transaction succeeds (callStatic confirms this)
      const tx = await savingsContract.manualWithdraw(accountId, { gasLimit: 500000 });
      await toast.promise(tx.wait(), {
        loading: `🔓 Withdrawing from "${goalName}"...`,
        success: `🎉 Withdrawn from "${goalName}" — tokens returned!`,
        error: '❌ Withdrawal failed'
      });
      await loadSavingsAccounts(account, savingsContract, provider, routerContract, ethPrice);
      await loadBalances(account, provider, tokenContract);
    } catch (error) {
      console.error('Manual withdraw error:', error);
      if (error.code === 'ACTION_REJECTED') {
        toast.error('Transaction cancelled');
      } else if (error.message?.includes('not yet eligible')) {
        toast.error('Account not yet eligible for withdrawal');
      } else {
        toast.error('Withdrawal failed: ' + (error.reason || error.message));
      }
    } finally {
      setLoading(false);
    }
  };

  // Admin: process all matured accounts (permissionless — anyone can call)
  const triggerProcessMaturedAccounts = async () => {
    try {
      setLoading(true);
      // Manual gas limit — auto-processing calls the oracle's TWAP update internally
      const tx = await savingsContract.processMaturedAccounts({ gasLimit: 800000 });
      await toast.promise(tx.wait(), {
        loading: '⚙️ Processing matured accounts...',
        success: '✅ Matured accounts processed!',
        error: '❌ Failed to process accounts'
      });
      await loadSavingsAccounts(account, savingsContract, provider, routerContract, ethPrice);
    } catch (error) {
      console.error('Process matured error:', error);
      if (error.code === 'ACTION_REJECTED') {
        toast.error('Transaction cancelled');
      } else {
        toast.error('Failed: ' + (error.reason || error.message));
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

  const renderAboutPage = () => (
    <div className="about-page">
      <div className="about-header">
        <img src={oooweeLogo} alt="OOOWEEE" className="about-logo pixel-art" />
        <h1>The OOOWEEE Protocol</h1>
        <p className="subtitle">Make your $aving goals non-negotiable</p>
      </div>

      <div className="about-section">
        <h2>The Problem</h2>
        <p>Saving money should be simple. But traditional banks make breaking your goals too easy &mdash; cooling-off periods you can override, penalty fees that barely sting, and no real accountability. 92% of people abandon their savings goals within 6 months.</p>
      </div>

      <div className="about-section">
        <h2>The Solution</h2>
        <p>OOOWEEE uses smart contracts to create savings accounts that <strong>cannot be broken early</strong>. No bank manager override. No "forgot password" backdoor. When you set a time lock, balance target, or growth goal &mdash; it's enforced by code, not willpower. Your future self will thank you.</p>
      </div>

      <div className="about-section features-section">
        <h2>Key Features</h2>
        <div className="features-grid">
          <div className="feature-card">
            <span className="feature-icon">🔒</span>
            <h3>Three Lock Types</h3>
            <p><strong>Time Lock</strong> &mdash; funds release after a set date. <strong>Balance Target</strong> &mdash; unlock when your savings hit a fiat value. <strong>Growth Goal</strong> &mdash; unlock when your tokens grow by a target percentage.</p>
          </div>
          <div className="feature-card">
            <span className="feature-icon">👥</span>
            <h3>Group Savings</h3>
            <p>Save together with friends, family, or communities. Create a shared goal, invite members, and watch your collective savings grow. Perfect for holidays, emergency funds, or group investments.</p>
          </div>
          <div className="feature-card">
            <span className="feature-icon">🎁</span>
            <h3>Passive Rewards</h3>
            <p>Active savers earn rewards from the protocol's validator staking income. The longer you save, the more you earn &mdash; all distributed automatically in $OOOWEEE.</p>
          </div>
          <div className="feature-card">
            <span className="feature-icon">🛡️</span>
            <h3>Price Stability</h3>
            <p>An automated stability mechanism monitors the token price and intervenes during excessive pumps, capturing ETH value and protecting savers from volatile swings.</p>
          </div>
          <div className="feature-card">
            <span className="feature-icon">💸</span>
            <h3>Multi-Currency Targets</h3>
            <p>Set your savings goals in USD, EUR, or GBP. Live Chainlink price feeds convert your $OOOWEEE balance to real-world values so you always know where you stand.</p>
          </div>
          <div className="feature-card">
            <span className="feature-icon">⚡</span>
            <h3>Auto-Unlock</h3>
            <p>When your savings account matures, Chainlink Automation processes the unlock automatically. No manual claiming needed &mdash; funds return to your wallet on time, every time.</p>
          </div>
        </div>
      </div>

      <div className="about-section">
        <h2>How the Value Flows</h2>
        <div className="flow-diagram">
          <div className="flow-step">
            <span className="step-icon">📈</span>
            <h3>1. Market Activity</h3>
            <p>Traders buy and sell $OOOWEEE on Uniswap, creating price movement</p>
          </div>
          <div className="flow-arrow">&#8594;</div>
          <div className="flow-step">
            <span className="step-icon">🛡️</span>
            <h3>2. Stability</h3>
            <p>Protocol detects price spikes above 10%, sells reserve tokens, captures ETH</p>
          </div>
          <div className="flow-arrow">&#8594;</div>
          <div className="flow-step">
            <span className="step-icon">🔐</span>
            <h3>3. Validators</h3>
            <p>Captured ETH funds Ethereum validators earning ~4% APY staking rewards</p>
          </div>
          <div className="flow-arrow">&#8594;</div>
          <div className="flow-step">
            <span className="step-icon">🎁</span>
            <h3>4. Rewards</h3>
            <p>Validator rewards are split: 34% converted to $OOOWEEE for savers</p>
          </div>
        </div>
      </div>

      <div className="tokenomics-section">
        <h2>Tokenomics</h2>
        <div className="tokenomics-grid">
          <div className="token-stat">
            <h4>Total Supply</h4>
            <p>100,000,000</p>
          </div>
          <div className="token-stat highlight">
            <h4>Stability Reserve</h4>
            <p>80,000,000 (80%)</p>
          </div>
          <div className="token-stat">
            <h4>Founder</h4>
            <p>10,000,000 (10%)</p>
          </div>
          <div className="token-stat">
            <h4>Operations</h4>
            <p>9,000,000 (9%)</p>
          </div>
          <div className="token-stat">
            <h4>Initial Liquidity</h4>
            <p>1,000,000 (1%)</p>
          </div>
        </div>
        <div className="tokenomics-details">
          <div className="tokenomics-detail-row">
            <span>Buy / Sell Tax</span>
            <span className="value">0%</span>
          </div>
          <div className="tokenomics-detail-row">
            <span>Savings Creation Fee</span>
            <span className="value">1%</span>
          </div>
          <div className="tokenomics-detail-row">
            <span>Validator Reward Split</span>
            <span className="value">33% Ops / 33% Validators / 34% Savers</span>
          </div>
        </div>
      </div>

      <div className="about-section">
        <h2>Smart Contracts</h2>
        <p style={{ marginBottom: '1rem' }}>All contracts are upgradeable (UUPS proxy pattern), verified on Etherscan, and powered by Chainlink oracles and automation.</p>
        <div className="contracts-list">
          <div className="contract-item">
            <span className="contract-name">$OOOWEEE Token</span>
            <span className="contract-desc">ERC-20 with stability mechanism integration</span>
          </div>
          <div className="contract-item">
            <span className="contract-name">Savings</span>
            <span className="contract-desc">Individual &amp; group accounts with auto-unlock</span>
          </div>
          <div className="contract-item">
            <span className="contract-name">Stability</span>
            <span className="contract-desc">Automated price intervention &amp; ETH capture</span>
          </div>
          <div className="contract-item">
            <span className="contract-name">Validator Fund</span>
            <span className="contract-desc">ETH staking &amp; 33/33/34 reward distribution</span>
          </div>
          <div className="contract-item">
            <span className="contract-name">Price Oracle</span>
            <span className="contract-desc">Chainlink feeds for USD, EUR, GBP conversion</span>
          </div>
          <div className="contract-item">
            <span className="contract-name">Donor Registry</span>
            <span className="contract-desc">On-chain recognition for community contributors</span>
          </div>
        </div>
      </div>

      <div className="cta-section">
        <h2>Ready to start saving?</h2>
        <p>Take control of your financial future. Create an account that holds you accountable.</p>
        <button onClick={() => setActiveTab('dashboard')} className="cta-button rainbow-btn">
          Start Saving Now
        </button>
      </div>

      {/* Whitepaper — Terminal-style renderer */}
      <div className="whitepaper-section" id="whitepaper">
        <h2>Whitepaper</h2>
        <p className="whitepaper-intro">Full technical documentation of the OOOWEEE Protocol.</p>
        <div className="terminal-window">
          <div className="terminal-header">
            <div className="terminal-dots">
              <span className="dot red"></span>
              <span className="dot yellow"></span>
              <span className="dot green"></span>
            </div>
            <span className="terminal-title">WHITEPAPER.md</span>
            <a
              href="https://github.com/oooweee-defi/oooweee-protocol/blob/main/WHITEPAPER.md"
              target="_blank"
              rel="noopener noreferrer"
              className="terminal-github-link"
            >
              View on GitHub &rarr;
            </a>
          </div>
          <div className="terminal-body">
            <pre className="terminal-content">{`# OOOWEEE Protocol Whitepaper

**A DeFi Savings Protocol with Built-In Price Stability**

Version 1.0 — February 2026

Website: https://oooweee.io
GitHub: https://github.com/oooweee-defi/oooweee-protocol
Contact: support@oooweee.io

---

## Table of Contents

1. Abstract
2. Problem Statement
3. Protocol Overview
4. The OOOWEEE Token
5. Goal-Based Savings Accounts
6. Group Savings
7. Price Stability Mechanism
8. Validator Fund & Staking Yield
9. Price Oracle System
10. Fee Structure
11. Rewards Distribution
12. Automation & Auto-Unlock
13. Security & Auditing
14. Smart Contract Architecture
15. Deployed Contracts
16. Roadmap
17. Team

---

## 1. Abstract

OOOWEEE is a decentralised savings protocol deployed on Ethereum
that enables users to create goal-based savings accounts denominated
in fiat currencies (USD, EUR, GBP). The protocol introduces a novel
price stability mechanism that suppresses speculative price spikes,
redirecting captured value into Ethereum validator staking. Staking
rewards are then distributed back to savers, creating a sustainable
yield loop that does not rely on inflation or unsustainable emissions.

The protocol is designed around a simple premise: cryptocurrency
savings should behave more like traditional savings accounts — with
predictable value growth, clear goals, and protection from volatility
— while retaining the transparency, self-custody, and permissionless
access of DeFi.

---

## 2. Problem Statement

Existing DeFi savings and yield protocols face several challenges
that limit mainstream adoption:

**Price Volatility**: Most DeFi tokens are subject to speculative
pumps and dumps. Users who deposit tokens into savings are exposed
to sudden price swings that can wipe out months of progress toward
a savings goal.

**Unsustainable Yield**: Many yield protocols rely on token emissions
(inflation) or complex leverage strategies that are unsustainable
long-term. When the emissions end or strategies unwind, yields
collapse.

**Fiat Disconnect**: Users think in fiat currencies — dollars, euros,
pounds. Most DeFi protocols operate entirely in token-denominated
terms, making it difficult for everyday users to set and track
real-world savings goals.

**Complexity**: DeFi savings products typically require users to
understand liquidity pools, impermanent loss, farming strategies,
and complex tokenomics. This creates a barrier to entry for
non-technical users.

OOOWEEE addresses these problems through an integrated protocol that
combines goal-based savings, automated price stability, fiat-
denominated tracking via Chainlink oracles, and real yield from
Ethereum validator staking.

---

## 3. Protocol Overview

The OOOWEEE Protocol consists of six interconnected smart contracts
deployed on Ethereum mainnet:

  Contract              | Purpose
  ----------------------|------------------------------------------
  OOOWEEEToken          | ERC-20 token with fixed 100M supply
  OOOWEEESavings        | Goal-based savings accounts (individual
                        | and group)
  OOOWEEEStability      | Automated price spike suppression
  OOOWEEEValidatorFund  | ETH accumulation & validator staking
  SavingsPriceOracle    | Chainlink + Uniswap price feeds for
                        | fiat conversion
  DonorRegistry         | Tracks community donations

These contracts form a closed-loop economic system:

  1. Users deposit OOOWEEE tokens into savings accounts
  2. Stability mechanism suppresses price spikes, capturing ETH
  3. Captured ETH flows to the Validator Fund
  4. Validator staking rewards split: ops / validators / savers
  5. Saver rewards swapped to OOOWEEE, distributed proportionally

---

## 4. The OOOWEEE Token

  Contract:     OOOWEEEToken.sol
  Standard:     ERC-20 (OpenZeppelin, UUPS Upgradeable)
  Name:         OOOWEEE
  Symbol:       OOOWEEE
  Total Supply: 100,000,000 (fixed, no minting capability)
  Decimals:     18

### 4.1 Token Distribution

  Allocation         | Amount      | %   | Purpose
  -------------------|-------------|-----|---------------------------
  Stability Reserve  | 80,000,000  | 80% | Price interventions
  Founder            | 10,000,000  | 10% | Lockup + tranche sales
  Operations         |  9,000,000  |  9% | Bootstrap validators
  Initial Liquidity  |  1,000,000  |  1% | Uniswap V2 trading pair

### 4.2 Design Principles

  - Fixed Supply: No minting function. 100M cap is immutable.
  - Zero Transfer Tax: No buy/sell taxes. Fees at savings level only.
  - Trading Controls: One-time enable, irreversible.
  - Ownership Safeguard: renounceOwnership() disabled.

### 4.3 Stability Reserve

80% of the total supply is transferred to the OOOWEEEStability
contract at deployment. This reserve is not circulating supply —
tokens only enter circulation when the stability mechanism sells
them to suppress price spikes, and the ETH captured from those
sales funds Ethereum validators.

### 4.4 Operations Allocation

9% of the supply is allocated to the operations wallet to cover
protocol running costs and to be sold privately to bootstrap the
first Ethereum validators.

### 4.5 Initial Liquidity

1% of the supply (1,000,000 tokens) was paired with ETH on
Uniswap V2 to establish the initial trading pair and provide
market liquidity at launch.

---

## 5. Goal-Based Savings Accounts

  Contract: OOOWEEESavings.sol

### 5.1 Account Types

  Time Account:
    - Tokens locked until a specified future date
    - User sets unlock timestamp at creation
    - Auto-unlocked by Chainlink Automation
    - Maximum lock: 100 years

  Growth Account:
    - Tokens locked until they reach a target fiat value
    - User sets target in USD, EUR, or GBP
    - Unlocks when oracle-reported value meets target

  Balance Account:
    - Like Growth, but with a designated recipient
    - Target amount transferred to recipient on completion
    - Remainder returned to account owner
    - Useful for gifting, bills, directed savings

### 5.2 Fiat-Denominated Goals

All account types display values in USD, EUR, or GBP. Growth and
Balance accounts use fiat-denominated targets — the unlock condition
is based on real-world value, not token quantity. Powered by the
SavingsPriceOracle combining Chainlink feeds with Uniswap V2 data.

### 5.3 Deposits

Users can deposit into active accounts at any time. Each deposit
incurs a 1% fee. Deposits tracked separately from rewards.

---

## 6. Group Savings

### 6.1 How Group Savings Work

  1. Creator opens group account with goal type, target, and
     destination wallet
  2. Creator invites members by wallet address
  3. Invited members accept and can deposit tokens
  4. Each member's contributions tracked individually
  5. On goal completion, funds sent to destination wallet

### 6.2 Group Cancellation

  - Sole creator: Can cancel immediately
  - Multi-member (Time): Creator cancels 1 year past unlock
  - Multi-member (Growth/Balance): Creator cancels 2 years
    past creation
  - Admin: Protocol owner can cancel any group at any time

  On cancellation, contributions returned proportionally.

### 6.3 Reward Isolation

Group deposits excluded from individual reward pool to prevent
dilution. Group accounts do not earn staking rewards.

---

## 7. Price Stability Mechanism

  Contract: OOOWEEEStability.sol

### 7.1 How It Works

  1. System monitors OOOWEEE/ETH price on Uniswap V2
  2. Time-weighted baseline tracks organic market value
  3. Price exceeds baseline by >10% → system intervenes
  4. Sells tokens from 80M stability reserve into pool
  5. Pushes price back toward baseline
  6. Captured ETH sent to Validator Fund

### 7.2 Deterministic Capture Rates

  Spike Severity         | Capture Rate
  -----------------------|-------------
  10-19% above baseline  |    60%
  20-29% above baseline  |    70%
  30-49% above baseline  |    75%
  50%+   above baseline  |    85%

These rates are deterministic and publicly visible in the smart
contract. There is no randomness.

### 7.3 Time-Weighted Baseline

  - Post-intervention: 80% old baseline + 20% new price
  - No intervention for 48h: baseline decays to market price
  - Max drift rate: 5% per hour (prevents slow-pump attacks)
  - Gradual price increases permitted; spikes captured

### 7.4 Circuit Breakers

  - Max 10 interventions per 24-hour period
  - Max 5,000,000 tokens sold per 24-hour period
  - Max 5% of reserves per single intervention
  - Auto-reset every 24 hours

### 7.5 Triggering

  1. Chainlink Automation: off-chain check every block (zero
     gas cost), triggers on-chain only when needed
  2. Manual check: anyone can trigger by sending 0.01 ETH

### 7.6 Token Swap Mechanics

Uses Uniswap V2 constant product formula to calculate exact tokens
needed for target capture rate. Compensates for 0.3% swap fee.
5% slippage tolerance.

---

## 8. Validator Fund & Staking Yield

  Contract: OOOWEEEValidatorFund.sol

### 8.1 ETH Sources

  - Stability interventions: ETH from price spike captures
  - Community donations: anyone can contribute via donate()

### 8.2 Validator Provisioning

  When fund accumulates 4 ETH (Rocketpool megapool minimum):
  1. 4 ETH released to operations wallet
  2. Operations deposits into Rocketpool megapool validator
  3. Withdrawal address set to Validator Fund contract
  4. Consensus-layer rewards flow back as ETH

### 8.3 Reward Distribution (33/33/34 Split)

  Share       | %   | Destination
  ------------|-----|-----------------------------------
  Operations  | 33% | ETH to operations wallet
  Validators  | 33% | Stays in fund (compounds)
  Savers      | 34% | Swapped to OOOWEEE, sent to
              |     | Savings contract

### 8.4 Compounding Effect

The 33% validator share stays in the fund, compounding over time.
More validators → more rewards → more validators. Expanding base
of productive assets backing the protocol.

---

## 9. Price Oracle System

  Contract: SavingsPriceOracle.sol

### 9.1 Price Calculation

  USD: OOOWEEE/ETH (Uniswap) × ETH/USD (Chainlink)
  EUR: OOOWEEE/USD ÷ EUR/USD (Chainlink)
  GBP: OOOWEEE/USD ÷ GBP/USD (Chainlink)

### 9.2 Chainlink Feeds (Mainnet)

  Feed    | Address                                    | Heartbeat
  --------|--------------------------------------------|----------
  ETH/USD | 0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419 | 1 hour
  EUR/USD | 0xb49f677943BC038e9857d61E7d053CaA2C1734C1 | 24 hours
  GBP/USD | 0x5c0Ab2d9b5a7ed9f470386e82BB36A3613cDd4b5 | 24 hours

### 9.3 TWAP Protection

30-minute TWAP from Uniswap V2 cumulative price accumulators.
When spot and TWAP diverge by >10%, TWAP is used instead.
Prevents flash loan attacks on withdrawal conditions.

### 9.4 Fallback Hierarchy

  1. Primary:        Chainlink + Uniswap spot price
  2. Fallback:       Emergency fixed rates (admin-set)
  3. Emergency:      Last valid cached price (within 24h)
  4. Final fallback: Hardcoded minimum value

---

## 10. Fee Structure

  Fee Type             | Rate | Applied When
  ---------------------|------|----------------------------
  Creation/Deposit Fee | 1%   | Creating account or deposit
  Withdrawal Fee       | 1%   | Withdrawing from completed

  - No transfer taxes, no buy/sell taxes, no hidden fees
  - Rates adjustable by owner, max 5% cap
  - Fees collected in OOOWEEE tokens

---

## 11. Rewards Distribution

### 11.1 Mechanism

  - Global rewardPerToken accumulator tracks cumulative rewards
  - On reward arrival: rewardPerToken += rewards / totalDeposited
  - Per-account: balance × (currentRewardPerToken − checkpoint)
  - Rewards tracked separately from deposits
  - Solvency check: earned rewards ≤ available balance

### 11.2 Claiming

  - Single account claim
  - Batch claim (up to 20 accounts per tx)
  - Automatic claiming during withdrawals

---

## 12. Automation & Auto-Unlock

### 12.1 How It Works

  1. Chainlink calls checkUpkeep() off-chain every block
  2. If accounts have met withdrawal conditions, returns list
  3. performUpkeep() processes up to 20 matured accounts
  4. Time accounts: auto-unlocked when timestamp passes
  5. Growth/Balance: auto-processed when fiat targets met

### 12.2 Public Processing

Anyone can call processMaturedAccounts() to trigger auto-unlock
without Chainlink. System works even if automation unavailable.

---

## 13. Security & Auditing

### 13.1 Smart Contract Security

  - UUPS Upgradeable Proxies (OpenZeppelin)
  - ReentrancyGuard on all state-changing functions
  - Ownership Controls (renounceOwnership disabled)
  - 50-slot storage gaps for safe upgrades

### 13.2 Audit Fixes Implemented

  C-1: Reward checkpoint at account creation
  C-2: Clean separation of deposits and rewards
  H-1: View functions for creation checks
  H-2: Group processing restricted + TWAP validated
  M-1: Consistent fee application
  M-2: Group deposits excluded from rewards
  M-3: Group cancellation with proportional refunds
  L-6: renounceOwnership() disabled

### 13.3 TWAP Validation

All withdrawal condition checks use TWAP-validated prices rather
than spot prices, preventing flash loan manipulation.

---

## 14. Smart Contract Architecture

All contracts deployed as UUPS upgradeable proxies (ERC-1967).

  User
   │
   ├──► OOOWEEEToken (ERC-20)
   │       └── 80M reserve ──► OOOWEEEStability
   │                               │
   │                               │ sells tokens on spikes
   │                               │ sends captured ETH ▼
   │                               │
   ├──► OOOWEEESavings ◄────── OOOWEEEValidatorFund
   │       │                       │
   │       │ deposits/withdraws    │ provisions validators
   │       │ earns rewards         │ distributes (33/33/34)
   │       │                       │
   │       └── SavingsPriceOracle  └── Rocketpool Validators
   │               │
   │               ├── Chainlink ETH/USD
   │               ├── Chainlink EUR/USD
   │               ├── Chainlink GBP/USD
   │               └── Uniswap V2 OOOWEEE/ETH Pool
   │
   └──► DonorRegistry (community donations)

---

## 15. Deployed Contracts

### Ethereum Mainnet (Chain ID: 1)

  Contract             | Address
  ---------------------|------------------------------------------
  OOOWEEEToken         | 0xFb46B3eED3590eE5049bCbDA084D5582f2c14D35
  SavingsPriceOracle   | 0x0C7b62E985D3Fb2c930a545C32D23d3920961354
  OOOWEEESavings       | 0x6D95790b279045FeAC6DEde30600B7E3890d2018
  OOOWEEEValidatorFund | 0xFC67Cb8e45408690029fEd391BD23861C46C92F2
  OOOWEEEStability     | 0x3797B40625db2eE5dB78E6C7757D701d28865890
  DonorRegistry        | 0xF726DA5DE29469DC73a1d75ebc8BAd0d3C92AAB2
  Uniswap V2 Pair      | 0x5Ad308657372C25Ae5C4F75140b3811F3314b8a4

### External Dependencies

  Dependency       | Address
  -----------------|------------------------------------------
  Uniswap V2 Router| 0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D
  Chainlink ETH/USD| 0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419
  Chainlink EUR/USD| 0xb49f677943BC038e9857d61E7d053CaA2C1734C1
  Chainlink GBP/USD| 0x5c0Ab2d9b5a7ed9f470386e82BB36A3613cDd4b5

All contracts verified on Etherscan. Source code open source at
https://github.com/oooweee-defi/oooweee-protocol

Deployed: February 11, 2026

---

## 16. Roadmap

### Phase 1 — Foundation (Complete)
  - Smart contract development and testing (Sepolia)
  - Security audit and remediation
  - Mainnet deployment
  - Web application launch at oooweee.io
  - Uniswap V2 liquidity establishment

### Phase 2 — Growth
  - Chainlink Automation for savings auto-unlock
  - First Ethereum validator via Rocketpool
  - Community donation programme
  - Etherscan token information and branding
  - Fiat on/off ramp integration

### Phase 3 — Expansion
  - Additional fiat currency support
  - Mobile-optimised experience
  - Multi-validator staking infrastructure

### Phase 4 — Maturity
  - Cross-chain expansion
  - Institutional savings products

---

## 17. Team

Ryan Heapes — Founder & Developer

---

## Disclaimer

This document is for informational purposes only and does not
constitute financial advice. OOOWEEE is an experimental DeFi
protocol. Users should conduct their own research and understand
the risks before interacting with any smart contracts. The
protocol's smart contracts are upgradeable, meaning the owner
retains the ability to modify contract logic. All code is open
source and verifiable on Etherscan.

---

OOOWEEE Protocol — Saving, Stabilised.`}</pre>
          </div>
        </div>
      </div>
    </div>
  );
  
  // NEW Community page render method
  const renderCommunityPage = () => (
    <div className="community-page">
      <div className="community-header">
        <h1>OOOWEEE Community</h1>
        <p>Supporting the network, together!</p>
      </div>

      {/* ATH Donor Banner */}
      {validatorStats.topDonor && parseFloat(validatorStats.topDonorAmount) > 0 && (
        <div className="ath-donor-banner">
          <div className="ath-badge">🏆 TOP SPONSOR</div>
          <div className="ath-content">
            <div className="ath-amount">{parseFloat(validatorStats.topDonorAmount).toFixed(4)} ETH</div>
            {donorLeaderboard.length > 0 && donorLeaderboard[0].name ? (
              <>
                <div className="ath-name">{donorLeaderboard[0].name}</div>
                {donorLeaderboard[0].message && (
                  <div className="ath-message">"{donorLeaderboard[0].message}"</div>
                )}
                {donorLeaderboard[0].location && (
                  <div className="ath-location">📍 {donorLeaderboard[0].location}</div>
                )}
              </>
            ) : (
              <div className="ath-address">{validatorStats.topDonor.slice(0, 6)}...{validatorStats.topDonor.slice(-4)}</div>
            )}
          </div>
        </div>
      )}

      {/* Validator Network Stats */}
      <div className="community-card validator-stats-card">
        <h2>Validator Network</h2>
        <div className="validator-metrics">
          <div className="metric-item">
            <span className="metric-icon">🖥️</span>
            <div className="metric-content">
              <h4>Active Validators</h4>
              <p className="metric-value">{validatorStats.validators}</p>
            </div>
          </div>
          <div className="metric-item">
            <span className="metric-icon">⏳</span>
            <div className="metric-content">
              <h4>Next Validator In</h4>
              <p className="metric-value">{parseFloat(validatorStats.nextValidatorIn).toFixed(4)} ETH</p>
            </div>
          </div>
          <div className="metric-item">
            <span className="metric-icon">🛡️</span>
            <div className="metric-content">
              <h4>From Stability</h4>
              <p className="metric-value">{parseFloat(validatorStats.fromStability).toFixed(4)} ETH</p>
            </div>
          </div>
          <div className="metric-item">
            <span className="metric-icon">🎁</span>
            <div className="metric-content">
              <h4>From Rewards</h4>
              <p className="metric-value">{parseFloat(validatorStats.fromRewards).toFixed(4)} ETH</p>
            </div>
          </div>
          <div className="metric-item">
            <span className="metric-icon">💎</span>
            <div className="metric-content">
              <h4>Total ETH Staked</h4>
              <p className="metric-value">{validatorStats.totalETHStaked?.toFixed(4) || '0'} ETH</p>
            </div>
          </div>
          <div className="metric-item">
            <span className="metric-icon">🔗</span>
            <div className="metric-content">
              <h4>Equivalent Solo Validators</h4>
              <p className="metric-value">{validatorStats.equivalentSoloValidators || '0'}</p>
            </div>
          </div>
          <div className="metric-item">
            <span className="metric-icon">📈</span>
            <div className="metric-content">
              <h4>Projected APR Pool</h4>
              <p className="metric-value">{validatorStats.projectedAPRPool || '0'} ETH/yr</p>
            </div>
          </div>
        </div>

        <div className="validator-progress-section">
          <h3>Progress to Next Validator</h3>
          <div className="progress-bar">
            <div
              className="progress-fill validator-progress"
              style={{ width: `${validatorStats.progress}%` }}
            />
          </div>
          <p className="progress-text">{parseFloat(validatorStats.pendingETH).toFixed(4)} / {validatorStats.requiredETH || 4} ETH ({validatorStats.progress.toFixed(1)}%)</p>
        </div>
      </div>

      {/* Community Donations */}
      <div className="community-card donations-card">
        <h2>Community Donations</h2>
        <div className="validator-metrics">
          <div className="metric-item">
            <span className="metric-icon">💰</span>
            <div className="metric-content">
              <h4>Total Donated</h4>
              <p className="metric-value">{parseFloat(validatorStats.totalDonations).toFixed(4)} ETH</p>
            </div>
          </div>
          <div className="metric-item">
            <span className="metric-icon">👥</span>
            <div className="metric-content">
              <h4>Total Donors</h4>
              <p className="metric-value">{validatorStats.donors}</p>
            </div>
          </div>
          <div className="metric-item">
            <span className="metric-icon">🏆</span>
            <div className="metric-content">
              <h4>Top Donor</h4>
              {validatorStats.topDonor ? (
                <>
                  <p className="metric-value">{parseFloat(validatorStats.topDonorAmount).toFixed(4)} ETH</p>
                  <p className="metric-sub">{validatorStats.topDonor.slice(0, 6)}...{validatorStats.topDonor.slice(-4)}</p>
                </>
              ) : (
                <p className="metric-value">—</p>
              )}
            </div>
          </div>
        </div>

        {account && (
          <button className="donate-btn" onClick={donateToValidators} disabled={loading}>
            💰 Donate to Validators
          </button>
        )}
      </div>

      {/* Donor Leaderboard */}
      {donorLeaderboard.length > 0 && (
        <div className="community-card leaderboard-card">
          <h2>Top Donors</h2>
          <div className="leaderboard-list">
            {donorLeaderboard.map((donor, index) => (
              <div key={donor.address || index} className={`leaderboard-entry ${index === 0 ? 'gold' : index === 1 ? 'silver' : index === 2 ? 'bronze' : ''}`}>
                <span className="medal">
                  {index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `#${index + 1}`}
                </span>
                <div className="donor-info">
                  <span className="donor-name">{donor.name || donor.shortAddress}</span>
                  {donor.name && <span className="donor-address">{donor.shortAddress}</span>}
                  {donor.message && <span className="donor-message">"{donor.message}"</span>}
                  {donor.location && <span className="donor-location">📍 {donor.location}</span>}
                </div>
                <span className="donor-amount">{donor.amount} ETH</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Community Shoutout */}
      {donorShoutout && (
        <div className="community-card shoutout-card">
          <h2>Community Message</h2>
          <div className="shoutout-content-wrapper">
            <div className="shoutout-icon">💖</div>
            <div className="shoutout-content">
              <blockquote className="shoutout-message">"{donorShoutout.message}"</blockquote>
              <p className="shoutout-meta">
                — {donorShoutout.name || donorShoutout.sender}
                {donorShoutout.location && `, ${donorShoutout.location}`}
                {' '}donated {donorShoutout.amount} ETH
              </p>
            </div>
          </div>
        </div>
      )}

      {/* How to Support */}
      <div className="community-card support-card">
        <h2>How You Can Support</h2>
        <div className="support-methods">
          <div className="support-item">
            <span className="support-icon">💝</span>
            <h3>Donate ETH</h3>
            <p>Help fund validators that generate rewards for all savers</p>
          </div>
          <div className="support-item">
            <span className="support-icon">💰</span>
            <h3>Save with OOOWEEE</h3>
            <p>Create savings accounts to build the ecosystem</p>
          </div>
          <div className="support-item">
            <span className="support-icon">📢</span>
            <h3>Spread the Word</h3>
            <p>Share OOOWEEE with friends and family</p>
          </div>
        </div>
      </div>

      {!account && (
        <div className="community-cta">
          <button onClick={connectWallet} className="connect-btn rainbow-btn" disabled={isConnecting}>
            Connect Wallet to Participate
          </button>
        </div>
      )}
    </div>
  );
  
  // Improved Admin Dashboard
  const renderAdminDashboard = () => (
    <div className="admin-dashboard">
      <div className="admin-header">
        <h1>Protocol Admin Dashboard</h1>
        <p className="admin-address">Connected: {account.slice(0, 6)}...{account.slice(-4)}</p>
      </div>
      
      {/* System Health Overview */}
      <div className="admin-section">
        <h2>System Health</h2>
        <div className="admin-grid-5">
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
              <p>{ethPrice?.[selectedCurrency.toLowerCase()]
                ? formatCurrency(oooweeePrice * ethPrice[selectedCurrency.toLowerCase()], selectedCurrency)
                : `${oooweeePrice.toFixed(10)} ETH`}</p>
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
          <div className={`admin-card ${priceFeedStatus.source !== 'live' ? 'admin-card-warning' : ''}`}>
            <div className="admin-card-icon">
              {priceFeedStatus.source === 'live' ? '✅' : priceFeedStatus.source === 'cached' ? '⚠️' : '🔴'}
            </div>
            <div className="admin-card-content">
              <h4>CoinGecko Feed</h4>
              <p>{priceFeedStatus.source === 'live' ? 'Live' : priceFeedStatus.source === 'cached' ? 'Using cached prices' : 'Down — fallback prices'}</p>
              {priceFeedStatus.source !== 'live' && priceFeedStatus.cachedAt && (
                <span className="admin-card-detail">Last live: {new Date(priceFeedStatus.cachedAt).toLocaleTimeString()}</span>
              )}
              {priceFeedStatus.error && (
                <span className="admin-card-detail error">{priceFeedStatus.error}</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Protocol Metrics */}
      <div className="admin-section">
        <h2>Protocol Metrics</h2>
        <div className="admin-grid-4">
          <div className="admin-card metric">
            <h4>Total Value Locked</h4>
            <p className="metric-value">{parseFloat(adminStats.totalValueLocked).toLocaleString()}</p>
            <span className="metric-label">OOOWEEE</span>
            <span className="metric-usd">≈ {getOooweeeInFiat(adminStats.totalValueLocked, selectedCurrency.toLowerCase())}</span>
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
      
      {/* User Metrics */}
      <div className="admin-section">
        <h2>User Metrics</h2>
        <div className="admin-grid-3">
          <div className="admin-card metric">
            <h4>Unique Savers</h4>
            <p className="metric-value">{userMetrics.loaded ? userMetrics.uniqueSavers : '...'}</p>
            <span className="metric-label">wallets with savings accounts</span>
          </div>
          <div className="admin-card metric">
            <h4>Token Holders</h4>
            <p className="metric-value">{userMetrics.loaded ? userMetrics.tokenHolders : '...'}</p>
            <span className="metric-label">wallets that received $OOOWEEE</span>
          </div>
          <div className="admin-card metric">
            <h4>Accounts per User</h4>
            <p className="metric-value">
              {userMetrics.loaded && userMetrics.uniqueSavers > 0
                ? (adminStats.totalAccountsCreated / userMetrics.uniqueSavers).toFixed(1)
                : '—'}
            </p>
            <span className="metric-label">avg savings accounts</span>
          </div>
        </div>
      </div>

      {/* Stability Mechanism */}
      <div className="admin-section">
        <h2>Stability Mechanism (SSA)</h2>
        
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
          <h3>Emergency Controls</h3>
          <div className="control-buttons-grid">
            <button
              className="admin-btn secondary"
              onClick={manualStabilityCheck}
              disabled={loading}
            >
              Manual Check (0.01 ETH)
            </button>
            <button
              className="admin-btn warning"
              onClick={resetCircuitBreaker}
              disabled={loading || !adminStats.circuitBreakerTripped}
            >
              Reset Circuit Breaker
            </button>
            <button
              className="admin-btn secondary"
              onClick={toggleSystemChecks}
              disabled={loading}
            >
              {adminStats.systemChecksEnabled ? 'Pause Checks' : 'Resume Checks'}
            </button>
          </div>
        </div>
      </div>
      
      {/* Validator Network */}
      <div className="admin-section">
        <h2>Validator Network</h2>
        <div className="admin-grid-4">
          <div className="admin-card">
            <h4>Active Validators</h4>
            <p className="metric-value">{validatorStats.validators}</p>
          </div>
          <div className="admin-card">
            <h4>Total ETH Staked</h4>
            <p className="metric-value">{validatorStats.totalETHStaked?.toFixed(4) || '0'}</p>
            <span className="metric-label">ETH ({validatorStats.equivalentSoloValidators || '0'} solo equiv.)</span>
          </div>
          <div className="admin-card">
            <h4>From Stability</h4>
            <p className="metric-value">{parseFloat(validatorStats.fromStability).toFixed(4)}</p>
            <span className="metric-label">ETH</span>
          </div>
          <div className="admin-card">
            <h4>From Rewards</h4>
            <p className="metric-value">{parseFloat(validatorStats.fromRewards).toFixed(4)}</p>
            <span className="metric-label">ETH</span>
          </div>
          <div className="admin-card">
            <h4>Total Donations</h4>
            <p className="metric-value">{parseFloat(validatorStats.totalDonations).toFixed(4)}</p>
            <span className="metric-label">ETH ({validatorStats.donors} donors)</span>
          </div>
          <div className="admin-card">
            <h4>Projected APR Pool</h4>
            <p className="metric-value">{validatorStats.projectedAPRPool || '0'}</p>
            <span className="metric-label">ETH/yr to savers</span>
          </div>
        </div>

        <div className="validator-progress-section">
          <h4>Progress to Next Validator</h4>
          <div className="validator-progress-bar">
            <div className="progress-fill" style={{ width: `${validatorStats.progress}%` }}></div>
          </div>
          <p className="progress-text">{parseFloat(validatorStats.pendingETH).toFixed(4)} / {validatorStats.requiredETH || 4} ETH ({validatorStats.progress.toFixed(1)}%)</p>
        </div>
      </div>
      
      {/* Quick Actions */}
      <div className="admin-section">
        <h2>Quick Actions</h2>
        <div className="action-buttons-grid">
          <button className="action-btn" onClick={() => window.location.reload()}>
            🔄 Refresh Dashboard
          </button>
          <button className="action-btn" onClick={() => console.log(adminStats)}>
            📋 Log Stats
          </button>
          <button className="action-btn" onClick={() => {
            const data = JSON.stringify(adminStats, null, 2);
            const blob = new Blob([data], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `oooweee-stats-${Date.now()}.json`;
            a.click();
          }}>
            💾 Export Stats
          </button>
          <button className="action-btn" onClick={triggerProcessMaturedAccounts} disabled={loading}>
            🔓 Process Matured Accounts
          </button>
        </div>
      </div>
      
      <div className="refresh-indicator">
        <span className="refresh-dot"></span>
        Auto-refreshing every 5 seconds
      </div>
    </div>
  );

  return (
    <div className="App">
      <Toaster position="top-right" />

      {/* Intro Sequence Modal */}
      {showIntro && (
        <div className="modal-overlay" onClick={() => {}}>
          <div className="modal-content intro-modal" onClick={(e) => e.stopPropagation()}>
            <button className="close-modal" onClick={() => { setShowIntro(false); localStorage.setItem('oooweee_intro_seen', 'true'); }}>✕</button>

            {introStep === 0 && (
              <div className="intro-step">
                <div className="intro-icon">🎉</div>
                <h2>Welcome to OOOWEEE!</h2>
                <p>Your wallet address is:</p>
                <p className="intro-address">{account?.slice(0, 8)}...{account?.slice(-6)}</p>
                <p>This is where your $OOOWEEE tokens live. Everything is secured by Ethereum smart contracts — no one else can touch your savings.</p>
              </div>
            )}

            {introStep === 1 && (
              <div className="intro-step">
                <div className="intro-icon">💰</div>
                <h2>Fund Your Wallet</h2>
                <p>You'll need $OOOWEEE tokens to create savings accounts.</p>
                <p>Tap <strong>"Buy $OOOWEEE"</strong> to swap some ETH for tokens. You can buy with as little as 0.001 ETH.</p>
                <p>Prices are shown in EUR, USD, or GBP — pick your currency from the dashboard.</p>
              </div>
            )}

            {introStep === 2 && (
              <div className="intro-step">
                <div className="intro-icon">🏦</div>
                <h2>Start Saving!</h2>
                <p>Create savings accounts with real goals:</p>
                <ul className="intro-list">
                  <li><strong>Time Lock</strong> — Lock until a date you choose</li>
                  <li><strong>Growth Goal</strong> — Grow to a target amount</li>
                  <li><strong>Balance Transfer</strong> — Auto-send when target is reached</li>
                </ul>
                <p>Set targets in EUR, USD, or GBP. Your savings are protected by smart contracts and can't be withdrawn early.</p>
              </div>
            )}

            <div className="intro-nav">
              {introStep > 0 && (
                <button className="intro-back-btn" onClick={() => setIntroStep(s => s - 1)}>Back</button>
              )}
              {introStep < 2 ? (
                <button className="intro-next-btn" onClick={() => setIntroStep(s => s + 1)}>Next</button>
              ) : (
                <button className="intro-next-btn intro-start-btn" onClick={() => { setShowIntro(false); localStorage.setItem('oooweee_intro_seen', 'true'); }}>
                  Get Started!
                </button>
              )}
            </div>

            <div className="intro-dots">
              {[0, 1, 2].map(i => (
                <span key={i} className={`intro-dot ${introStep === i ? 'active' : ''}`} />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Send Modal */}
      {showSendModal && (
        <div className="modal-overlay" onClick={() => setShowSendModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2>📤 Send $OOOWEEE</h2>
            <button className="close-modal" onClick={() => setShowSendModal(false)}>✕</button>

            <div className="form-group">
              <label>Recipient Address</label>
              <input
                type="text"
                placeholder="0x..."
                value={sendRecipient}
                onChange={(e) => setSendRecipient(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label>Amount (OOOWEEE)</label>
              <input
                type="number"
                placeholder="0"
                value={sendAmount}
                onChange={(e) => setSendAmount(e.target.value)}
              />
              <p className="info-text">Available: {parseFloat(balance).toLocaleString()} OOOWEEE</p>
            </div>

            <button
              className="cta-button rainbow-btn"
              onClick={sendTokens}
              disabled={loading || !sendRecipient || !sendAmount || parseFloat(sendAmount) <= 0}
            >
              {loading ? 'Sending...' : 'Send'}
            </button>
          </div>
        </div>
      )}

      {showBuyModal && (
        <div className="modal-overlay" onClick={() => { setShowBuyModal(false); setRequiredOooweeeForPurchase(null); }}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2>Buy $OOOWEEE</h2>
            <button className="close-modal" onClick={() => { setShowBuyModal(false); setRequiredOooweeeForPurchase(null); }}>✕</button>
            
            <div className="buy-form">
              <div className="balance-info">
                <p>ETH Balance: {parseFloat(ethBalance).toFixed(4)} ETH</p>
                <p>Current Rate: 1 ETH = {(1/oooweeePrice).toFixed(0)} OOOWEEE</p>
              </div>
              
              {requiredOooweeeForPurchase ? (
                <>
                  <div className="output-estimate">
                    <p>You need exactly:</p>
                    <h3>{Math.ceil(requiredOooweeeForPurchase).toLocaleString()} $OOOWEEE</h3>
                    <p className="fiat-value">≈ {ethToBuy} ETH (with 5% buffer)</p>
                  </div>
                  
                  <button 
                    className="buy-btn rainbow-btn"
                    onClick={buyExactOooweee}
                    disabled={loading}
                  >
                    {loading ? '⏳ Processing...' : `🚀 Buy Exactly ${Math.ceil(requiredOooweeeForPurchase).toLocaleString()} OOOWEEE`}
                  </button>
                  
                  <button 
                    className="secondary-btn"
                    onClick={() => setRequiredOooweeeForPurchase(null)}
                    style={{ marginTop: '0.5rem', background: 'transparent', border: '2px solid #000', width: '100%', padding: '0.5rem', cursor: 'pointer' }}
                  >
                    Or buy a custom amount →
                  </button>
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
                      <p className="fiat-value">≈ {getOooweeeInFiat(estimatedOooweee, selectedCurrency.toLowerCase())}</p>
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

                  {/* Fiat onramp — disabled until provider account is set up
                  <div className="onramp-divider">
                    <span>or buy ETH directly with</span>
                  </div>
                  <button
                    className="fiat-onramp-btn"
                    onClick={() => { setShowBuyModal(false); openFiatOnramp(); }}
                  >
                    💳 Card / Google Pay / Apple Pay
                  </button>
                  */}
                </>
              )}
            </div>
          </div>
        </div>
      )}
      
      {showDonateModal && (
        <div className="modal-overlay" onClick={() => { setShowDonateModal(false); setDonorMessage(''); setDonorName(''); setDonorLocation(''); }}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2>Donate to Validators</h2>
            <button className="close-modal" onClick={() => { setShowDonateModal(false); setDonorMessage(''); setDonorName(''); setDonorLocation(''); }}>✕</button>
            
            <div className="buy-form">
              <div className="balance-info">
                <p>ETH Balance: {parseFloat(ethBalance).toFixed(4)} ETH</p>
                <p>Your donation helps fund Ethereum validators that generate rewards for savers!</p>
              </div>
              
              <div className="input-group">
                <label>ETH Amount:</label>
                <input
                  type="number"
                  value={donateAmount}
                  onChange={(e) => setDonateAmount(e.target.value)}
                  min="0.001"
                  step="0.01"
                  max={ethBalance}
                />
              </div>
              
              <div className="quick-amounts">
                <button onClick={() => setDonateAmount('0.01')}>0.01 ETH</button>
                <button onClick={() => setDonateAmount('0.05')}>0.05 ETH</button>
                <button onClick={() => setDonateAmount('0.1')}>0.1 ETH</button>
                <button onClick={() => setDonateAmount('0.5')}>0.5 ETH</button>
              </div>
              
              {parseFloat(donateAmount) >= 0.05 ? (
                <>
                  <div className="sponsor-tier-notice">
                    <p>🌟 Sponsor tier! Your name & message will be saved on-chain forever.</p>
                  </div>
                  <div className="donor-info-fields">
                    <div className="input-group">
                      <label>Your Name (optional):</label>
                      <input
                        type="text"
                        value={donorName}
                        onChange={(e) => setDonorName(e.target.value.slice(0, 50))}
                        placeholder="Anonymous"
                        maxLength={50}
                      />
                    </div>

                    <div className="input-group">
                      <label>Location (optional):</label>
                      <input
                        type="text"
                        value={donorLocation}
                        onChange={(e) => setDonorLocation(e.target.value.slice(0, 50))}
                        placeholder="e.g. Dublin, Ireland"
                        maxLength={50}
                      />
                    </div>
                  </div>

                  <div className="input-group message-group">
                    <label>Your Message (optional):</label>
                    <textarea
                      value={donorMessage}
                      onChange={(e) => setDonorMessage(e.target.value.slice(0, 180))}
                      placeholder="Leave a message for the community..."
                      maxLength={180}
                      rows={3}
                    />
                    <span className="char-count">{donorMessage.length}/180</span>
                  </div>

                  {(donorName.trim() || donorMessage.trim() || donorLocation.trim()) && (
                    <div className="info-notice">
                      <p>ℹ️ Donation includes gas fees for sponsor registration.</p>
                    </div>
                  )}
                </>
              ) : (
                <div className="info-notice">
                  <p>💡 Donate 0.05+ ETH to become a sponsor — your name & message saved on-chain forever!</p>
                </div>
              )}

              <button
                className="buy-btn"
                onClick={handleDonateSubmit}
                disabled={loading || parseFloat(donateAmount) <= 0 || parseFloat(donateAmount) > parseFloat(ethBalance)}
              >
                {loading ? '⏳ Processing...' : `💝 Donate ${donateAmount} ETH`}
              </button>
            </div>
          </div>
        </div>
      )}
      
      {showCreateModal && (
        <div className="modal-overlay" onClick={() => setShowCreateModal(false)}>
          <div className="modal-content create-modal" onClick={(e) => e.stopPropagation()}>
            <h2>New Savings Account</h2>
            <button className="close-modal" onClick={() => setShowCreateModal(false)}>✕</button>
            
            <div className="buy-form">
              <div className="form-group">
                <label>Account Name:</label>
                <input
                  type="text"
                  placeholder="e.g., Epic Vacation"
                  id="goalName"
                  className="text-input"
                />
              </div>

              <div className="form-group">
                <label>Account Type:</label>
                <select
                  id="accountType"
                  value={accountType}
                  onChange={(e) => setAccountType(e.target.value)}
                  className="select-input"
                >
                  <option value="time">Time Lock - Lock until date</option>
                  <option value="growth">Growth Goal - Grow to target</option>
                  <option value="balance">Transfer Goal - Send at target</option>
                  <option value="group">👥 Group Savings - Save together</option>
                </select>
              </div>

              <div className="form-group">
                <label>Display Currency:</label>
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
                <label>Initial Deposit ({CURRENCIES[accountCurrency].symbol}):</label>
                <input 
                  type="number" 
                  placeholder={`Deposit in ${CURRENCIES[accountCurrency].name}`}
                  id="initialDeposit"
                  min="10"
                  step="1"
                  value={initialDepositInput}
                  onChange={(e) => setInitialDepositInput(e.target.value)}
                  className="number-input"
                />
                {initialDepositInput && (
                  <p className="conversion-note">
                    ≈ {convertFiatToOooweee(initialDepositInput, accountCurrency.toLowerCase()).toLocaleString()} $OOOWEEE at current rate
                  </p>
                )}
                <p className="fee-note">1% creation fee from initial deposit</p>
                <p className="fee-note">📋 Minimum deposit: €10 equivalent</p>
                {initialDepositInput && parseFloat(initialDepositInput) < 10 && accountCurrency === 'EUR' && (
                  <p className="error-note">⚠️ Minimum deposit is €10</p>
                )}
                {(() => {
                  const oooweeeNeeded = convertFiatToOooweee(initialDepositInput, accountCurrency.toLowerCase());
                  return parseFloat(balance) < oooweeeNeeded && initialDepositInput ? (
                    <p className="swap-notice">⚠️ Insufficient balance - will offer to buy with ETH</p>
                  ) : null;
                })()}
              </div>
              
              {/* Group-specific: sub-type and destination */}
              {accountType === 'group' && (
                <>
                  <div className="form-group">
                    <label>Group Type:</label>
                    <select
                      value={groupSubType}
                      onChange={(e) => setGroupSubType(e.target.value)}
                      className="select-input"
                    >
                      <option value="time">Time Lock - Lock until date</option>
                      <option value="growth">Growth Goal - Grow to target</option>
                      <option value="balance">Transfer Goal - Send at target</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label>📮 Destination Wallet:</label>
                    <input
                      type="text"
                      placeholder="0x... (where funds go on completion)"
                      value={groupDestination}
                      onChange={(e) => setGroupDestination(e.target.value)}
                      className="text-input"
                    />
                    <p className="info-note">Funds will be sent here when the group goal is completed</p>
                  </div>
                </>
              )}

              {/* Time: unlock date (individual or group time sub-type) */}
              {(accountType === 'time' || (accountType === 'group' && groupSubType === 'time')) && (
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

              {/* Growth/Balance: target amount (individual or group growth/balance sub-type) */}
              {(accountType === 'growth' || accountType === 'balance' || (accountType === 'group' && (groupSubType === 'growth' || groupSubType === 'balance'))) && (
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
                  {(accountType === 'growth' || (accountType === 'group' && groupSubType === 'growth')) && initialDepositInput && targetAmountInput && (
                    (() => {
                      if (parseFloat(initialDepositInput) >= parseFloat(targetAmountInput)) {
                        return <p className="error-note">⚠️ Target must be higher than initial deposit ({CURRENCIES[accountCurrency].symbol}{initialDepositInput})</p>;
                      }
                      return null;
                    })()
                  )}
                </div>
              )}

              {/* Balance: recipient address (individual only — group uses destination wallet) */}
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
                onClick={async () => { await handleCreateAccount(); setShowCreateModal(false); }}
                disabled={loading}
                className="buy-btn rainbow-btn"
              >
                {loading ? '⏳ Processing...' : '🚀 Create Savings Account'}
              </button>
            </div>
          </div>
        </div>
      )}
      
      <header className="App-header">
        <div className="tab-navigation">
          <button 
            className={`tab-btn ${activeTab === 'dashboard' ? 'active' : ''}`}
            onClick={() => setActiveTab('dashboard')}
          >
            Dashboard
          </button>
          <button 
            className={`tab-btn ${activeTab === 'community' ? 'active' : ''}`}
            onClick={() => setActiveTab('community')}
          >
            Community
          </button>
          <button 
            className={`tab-btn ${activeTab === 'about' ? 'active' : ''}`}
            onClick={() => setActiveTab('about')}
          >
            About
          </button>
          {account?.toLowerCase() === ADMIN_WALLET.toLowerCase() && (
            <button
              className={`tab-btn admin-tab ${activeTab === 'admin' ? 'active' : ''}`}
              onClick={() => setActiveTab('admin')}
            >
              Admin
            </button>
          )}

          <div className="header-auth">
            {!account ? (
              <button className="tab-btn login-btn" onClick={connectSocialLogin} disabled={isConnecting || !web3auth}>
                {isConnecting ? 'Signing in...' : 'Sign In'}
              </button>
            ) : (
              <div className="header-wallet-info">
                <span className="header-address" onClick={() => { navigator.clipboard.writeText(account); toast.success('Copied!'); }}>
                  {account.slice(0, 6)}...{account.slice(-4)}
                </span>
                <button className="tab-btn disconnect-header-btn" onClick={disconnectWallet}>
                  Disconnect
                </button>
              </div>
            )}
          </div>
        </div>

        {activeTab === 'about' ? (
          renderAboutPage()
        ) : activeTab === 'community' ? (
          renderCommunityPage()
        ) : activeTab === 'admin' && account?.toLowerCase() === ADMIN_WALLET.toLowerCase() ? (
          renderAdminDashboard()
        ) : (
          <>
            <div className="hero-section">
              <img src={oooweeLogo} alt="OOOWEEE" className="main-logo pixel-art" />
              <p className="tagline">OOOWEEE! Make your $aving goals non-negotiable!</p>
              
              {/* Price Ticker */}
              <div className="price-ticker">
                <div className="price-item">
                  <span className="price-label">OOOWEEE/ETH</span>
                  <span className={`price-value ${priceFlash ? `flash-${priceFlash}` : ''}`}>
                    {oooweeePrice > 0 ? oooweeePrice.toFixed(10) : '...'}
                  </span>
                </div>
                <div className="price-item">
                  <span className="price-label">OOOWEEE/{selectedCurrency}</span>
                  <span className={`price-value ${priceFlash ? `flash-${priceFlash}` : ''}`}>
                    {ethPrice?.[selectedCurrency.toLowerCase()]
                      ? formatCurrency(oooweeePrice * ethPrice[selectedCurrency.toLowerCase()], selectedCurrency)
                      : '...'}
                  </span>
                </div>
                <div className="price-item">
                  <span className="price-label">ETH/{selectedCurrency}</span>
                  <span className="price-value">
                    {ethPrice?.[selectedCurrency.toLowerCase()]
                      ? formatCurrency(ethPrice[selectedCurrency.toLowerCase()], selectedCurrency)
                      : '...'}
                  </span>
                </div>
              </div>
            </div>

            {!account ? (
              <div className="connect-section">
                <div className="welcome-card">
                  <h3>Welcome to OOOWEEE</h3>
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
                <div className="connect-options">
                  <button onClick={connectSocialLogin} className="connect-btn social-btn" disabled={isConnecting || !web3auth}>
                    {isConnecting ? 'Signing in...' : 'Sign in with Google / Email'}
                  </button>

                  <div className="divider-text">
                    <span>or</span>
                  </div>

                  <button onClick={connectWallet} className="connect-btn wallet-btn" disabled={isConnecting}>
                    {isConnecting ? 'Connecting...' : 'Connect Wallet (MetaMask etc.)'}
                  </button>
                </div>
                <p className="disclaimer">Values shown in your selected currency are estimates based on current market rates</p>
              </div>
            ) : (
              <div className="dashboard">
                <div className="wallet-info">
                  <div className="wallet-card">
                    <div className="wallet-header">
                      <h3>Wallet</h3>
                      <span
                        className="address copyable"
                        title="Click to copy full address"
                        onClick={() => {
                          navigator.clipboard.writeText(account);
                          toast.success('Wallet address copied!');
                        }}
                      >
                        {account.slice(0, 6)}...{account.slice(-4)} 📋
                      </span>
                      <button onClick={disconnectWallet} className="disconnect-btn">Disconnect</button>
                    </div>
                    
                    <div className="currency-toggle">
                      <button
                        className={`toggle-btn ${!showFiat ? 'active' : ''}`}
                        onClick={() => setShowFiat(false)}
                      >
                        Crypto
                      </button>
                      <select
                        className={`currency-select ${showFiat ? 'active' : ''}`}
                        value={selectedCurrency}
                        onChange={(e) => {
                          setSelectedCurrency(e.target.value);
                          setShowFiat(true);
                        }}
                        onClick={() => setShowFiat(true)}
                      >
                        {Object.entries(CURRENCIES).map(([code, info]) => (
                          <option key={code} value={code}>{info.symbol} {code}</option>
                        ))}
                      </select>
                    </div>
                    
                    <div className="balance-row">
                      <span>ETH:</span>
                      <span>{parseFloat(ethBalance).toFixed(4)} ETH</span>
                    </div>
                    
                    <div className="balance-row highlight">
                      <span>$OOOWEEE:</span>
                      <span>
                        {!showFiat
                          ? `${parseFloat(balance).toLocaleString()} $OOOWEEE`
                          : (() => {
                              const currInfo = CURRENCIES[selectedCurrency] || CURRENCIES.EUR;
                              const fiatVal = balanceFiat[selectedCurrency.toLowerCase()];
                              return fiatVal !== undefined
                                ? `${currInfo.symbol}${(fiatVal / Math.pow(10, currInfo.decimals)).toFixed(2)}`
                                : getOooweeeInFiat(balance, selectedCurrency.toLowerCase());
                            })()
                        }
                      </span>
                    </div>
                    {showFiat && (
                      <p className="conversion-note">≈ {parseFloat(balance).toLocaleString()} $OOOWEEE</p>
                    )}
                    
                    {parseFloat(balance) === 0 && (
                      <div className="zero-balance-notice">
                        <p>No OOOWEEE yet? Get started!</p>
                      </div>
                    )}
                    
                    <button
                      className="add-oooweee-btn rainbow-btn"
                      onClick={() => setShowBuyModal(true)}
                    >
                      Buy $OOOWEEE
                    </button>

                    <button
                      className="add-oooweee-btn"
                      onClick={() => setShowSendModal(true)}
                      disabled={parseFloat(balance) === 0}
                      style={{ marginTop: '8px', background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}
                    >
                      📤 Send $OOOWEEE
                    </button>

                    <button
                      className="create-savings-btn"
                      onClick={() => setShowCreateModal(true)}
                    >
                      New Savings Account
                    </button>
                  </div>
                </div>

                <div className="savings-section">
                  {activeAccounts.length > 0 && (
                    <>
                      <div className="section-header">
                        <h2>Your Active Accounts</h2>
                        {activeAccounts.some(acc => parseFloat(acc.pendingRewards) > 0) && (
                          <button className="claim-all-btn" onClick={claimAllRewards} disabled={loading}>
                            Claim All Rewards
                          </button>
                        )}
                      </div>
                      <div className="accounts-grid">
                        {activeAccounts.map(acc => {
                          const currency = getCurrencyFromCode(acc.targetCurrency);
                          const currencyInfo = CURRENCIES[currency];
                          
                          return (
                            <div key={acc.id} className={`account-card ${acc.type === 'Time' ? 'time-lock' : acc.type === 'Growth' ? 'growth-goal' : 'balance-transfer'}`}>
                              <div className="account-header">
                                <h3>{acc.goalName}</h3>
                                <span className={`account-type ${acc.type.toLowerCase()}`}>{acc.type}</span>
                              </div>
                              
                              <div className="account-details">
                                {/* Target amount at top for Growth/Balance accounts */}
                                {acc.isFiatTarget && (acc.type === 'Growth' || acc.type === 'Balance') && (
                                  <div className="detail-row target-highlight">
                                    <span>Target:</span>
                                    <span className="primary-amount">
                                      {currencyInfo.symbol}
                                      {(acc.targetFiat / Math.pow(10, currencyInfo.decimals)).toFixed(2)}
                                    </span>
                                  </div>
                                )}
                                {!acc.isFiatTarget && acc.type === 'Growth' && (
                                  <div className="detail-row target-highlight">
                                    <span>Target:</span>
                                    <span className="primary-amount">
                                      {!showFiat
                                        ? `${parseFloat(acc.target).toLocaleString()} $OOOWEEE`
                                        : getOooweeeInFiat(acc.target, selectedCurrency.toLowerCase())
                                      }
                                    </span>
                                  </div>
                                )}
                                {!acc.isFiatTarget && acc.type === 'Balance' && (
                                  <div className="detail-row target-highlight">
                                    <span>Target:</span>
                                    <span className="primary-amount">
                                      {!showFiat
                                        ? `${parseFloat(acc.target).toLocaleString()} $OOOWEEE`
                                        : getOooweeeInFiat(acc.target, selectedCurrency.toLowerCase())
                                      }
                                    </span>
                                  </div>
                                )}
                                {acc.type === 'Time' && (
                                  <div className="detail-row target-highlight">
                                    <span>Unlocks in:</span>
                                    <span className="primary-amount">{getDaysRemaining(acc.unlockTime)} days</span>
                                  </div>
                                )}

                                {/* Current value / balance */}
                                <div className="fiat-target-display">
                                  <div className="detail-row">
                                    <span>{acc.isFiatTarget ? 'Current Value:' : 'Balance:'}</span>
                                    <span className="primary-amount">
                                      {!showFiat
                                        ? `${parseFloat(acc.balance).toLocaleString()} $OOOWEEE`
                                        : `${currencyInfo.symbol}${(acc.currentFiatValue / Math.pow(10, currencyInfo.decimals)).toFixed(2)}`
                                      }
                                    </span>
                                  </div>
                                  <div className="balance-in-tokens">
                                    <span className="secondary-amount">
                                      {showFiat
                                        ? `${parseFloat(acc.balance).toLocaleString()} $OOOWEEE`
                                        : `≈ ${currencyInfo.symbol}${(acc.currentFiatValue / Math.pow(10, currencyInfo.decimals)).toFixed(2)}`
                                      }
                                    </span>
                                  </div>
                                </div>

                                {acc.type === 'Balance' && (
                                  <>
                                    <div className="detail-row">
                                      <span>To:</span>
                                      <span className="value address">{acc.recipient.slice(0, 6)}...{acc.recipient.slice(-4)}</span>
                                    </div>
                                    <p className="info-note">Need 101% for auto-transfer</p>
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
                                {(() => {
                                  const currency = acc.isFiatTarget ? getCurrencyFromCode(acc.targetCurrency) : 'EUR';
                                  return (
                                    <>
                                      <label className="deposit-label">Deposit ({currency})</label>
                                      <input 
                                        type="number" 
                                        placeholder={`Amount in ${currency}`}
                                        id={`deposit-${acc.id}`}
                                        min="1"
                                        step="1"
                                        className="deposit-input"
                                        onChange={(e) => {
                                          const fiatAmount = e.target.value;
                                          const oooweeeAmount = convertFiatToOooweee(fiatAmount, currency);
                                          const converter = document.getElementById(`deposit-convert-${acc.id}`);
                                          if (converter) {
                                            converter.textContent = fiatAmount && fiatAmount > 0
                                              ? `≈ ${oooweeeAmount.toLocaleString()} OOOWEEE`
                                              : '';
                                          }
                                        }}
                                      />
                                      <span id={`deposit-convert-${acc.id}`} className="deposit-conversion"></span>
                                    </>
                                  );
                                })()}
                                <button
                                  onClick={async () => {
                                    const currency = acc.isFiatTarget ? getCurrencyFromCode(acc.targetCurrency) : 'EUR';
                                    const fiatAmount = document.getElementById(`deposit-${acc.id}`)?.value;
                                    if (fiatAmount && fiatAmount > 0) {
                                      const oooweeeAmount = await convertFiatToOooweeeOracle(fiatAmount, currency);
                                      if (oooweeeAmount > 0) {
                                        depositToAccount(acc.id, oooweeeAmount.toString());
                                      } else {
                                        toast.error('Amount too small');
                                      }
                                    } else {
                                      toast.error('Enter an amount');
                                    }
                                  }}
                                  disabled={loading}
                                  className="deposit-btn"
                                >
                                  DEPOSIT
                                </button>
                              </div>

                              {/* Withdraw button for matured accounts */}
                              {acc.progress >= 100 && (
                                <div className="withdraw-section">
                                  <button
                                    onClick={() => manualWithdraw(acc.id, acc.goalName)}
                                    disabled={loading}
                                    className="withdraw-btn"
                                  >
                                    🔓 WITHDRAW — Goal Reached!
                                  </button>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </>
                  )}
                </div>

                {/* Pending Group Invitations */}
                {pendingInvitations.length > 0 && (
                  <div className="invitations-banner">
                    <h3>📨 Pending Group Invitations</h3>
                    {pendingInvitations.map(group => (
                      <div key={`inv-${group.id}`} className="invitation-card">
                        <div className="invitation-info">
                          <strong>{group.goalName}</strong>
                          <span className="invitation-meta">
                            👥 {group.accountType} · {group.memberCount} member{group.memberCount !== 1 ? 's' : ''} · {parseFloat(group.totalBalance).toLocaleString()} $OOOWEEE pooled
                          </span>
                          <span className="invitation-creator">
                            Created by {group.creator.slice(0, 6)}...{group.creator.slice(-4)}
                          </span>
                        </div>
                        <button
                          className="accept-invite-btn"
                          onClick={() => acceptGroupInvitation(group.id)}
                          disabled={loading}
                        >
                          🤝 Accept
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Group Accounts Section */}
                {userGroups.filter(g => g.isMember && g.isActive).length > 0 && (
                  <div className="savings-section">
                    <div className="section-header">
                      <h2>👥 Your Group Accounts</h2>
                    </div>
                    <div className="accounts-grid">
                      {userGroups.filter(g => g.isMember && g.isActive).map(group => {
                        const currency = getCurrencyFromCode(group.targetCurrency);
                        const currencyInfo = CURRENCIES[currency];
                        const isCreator = group.creator.toLowerCase() === account?.toLowerCase();
                        const isExpanded = showGroupDetail === group.id;

                        return (
                          <div key={`group-${group.id}`} className="account-card group-card">
                            <div className="account-header">
                              <h3>{group.goalName}</h3>
                              <div className="header-badges">
                                <span className={`account-type ${group.accountType.toLowerCase()}`}>
                                  👥 {group.accountType}
                                </span>
                                <span className="currency-badge">{currency}</span>
                              </div>
                            </div>

                            <div className="account-details">
                              <div className="detail-row">
                                <span>Total Balance:</span>
                                <span className="primary-amount">
                                  {parseFloat(group.totalBalance).toLocaleString()} $OOOWEEE
                                </span>
                              </div>

                              {(group.accountType === 'Growth' || group.accountType === 'Balance') && group.targetFiat !== '0' && (
                                <div className="detail-row">
                                  <span>Target:</span>
                                  <span className="value">
                                    {currencyInfo.symbol}
                                    {(parseInt(group.targetFiat) / Math.pow(10, currencyInfo.decimals)).toFixed(currencyInfo.decimals)}
                                  </span>
                                </div>
                              )}

                              {group.accountType === 'Time' && group.unlockTime > 0 && (
                                <div className="detail-row">
                                  <span>Unlock Date:</span>
                                  <span className="value">
                                    {new Date(group.unlockTime * 1000).toLocaleDateString()}
                                  </span>
                                </div>
                              )}

                              <div className="detail-row">
                                <span>Members:</span>
                                <span className="value">{group.memberCount}</span>
                              </div>

                              <div className="detail-row">
                                <span>My Contribution:</span>
                                <span className="value">{parseFloat(group.myContribution).toLocaleString()} $OOOWEEE</span>
                              </div>

                              {group.destinationWallet && group.destinationWallet !== ethers.constants.AddressZero && (
                                <div className="detail-row">
                                  <span>Destination:</span>
                                  <span className="value address">
                                    {group.destinationWallet.slice(0, 6)}...{group.destinationWallet.slice(-4)}
                                  </span>
                                </div>
                              )}
                            </div>

                            {/* Expand/collapse details */}
                            <button
                              className="toggle-btn"
                              onClick={() => setShowGroupDetail(isExpanded ? null : group.id)}
                              style={{ marginBottom: '0.5rem', fontSize: '0.85rem' }}
                            >
                              {isExpanded ? '▲ Hide Details' : '▼ Show Details'}
                            </button>

                            {isExpanded && (
                              <div className="group-expanded">
                                {/* Member list */}
                                <div className="group-members">
                                  <strong>Members:</strong>
                                  {group.members.map((m, idx) => (
                                    <div key={idx} className="member-row">
                                      <span className="value address">
                                        {m.slice(0, 6)}...{m.slice(-4)}
                                        {m.toLowerCase() === group.creator.toLowerCase() ? ' (creator)' : ''}
                                        {m.toLowerCase() === account?.toLowerCase() ? ' (you)' : ''}
                                      </span>
                                    </div>
                                  ))}
                                </div>

                                {/* Creator: Invite member */}
                                {isCreator && (
                                  <div className="group-invite-section">
                                    <label>Invite Member:</label>
                                    <input
                                      type="text"
                                      placeholder="0x... wallet address"
                                      value={groupInviteAddress}
                                      onChange={(e) => setGroupInviteAddress(e.target.value)}
                                      className="deposit-input"
                                    />
                                    <button
                                      onClick={() => inviteMemberToGroup(group.id, groupInviteAddress)}
                                      disabled={loading || !groupInviteAddress}
                                      className="deposit-btn"
                                    >
                                      📨 Invite
                                    </button>
                                  </div>
                                )}

                                {/* Process / Complete group */}
                                <button
                                  onClick={() => processGroup(group.id)}
                                  disabled={loading}
                                  className="deposit-btn"
                                  style={{ marginTop: '0.5rem', background: 'linear-gradient(135deg, #10b981, #059669)' }}
                                >
                                  🏁 Complete Group Account
                                </button>
                              </div>
                            )}

                            {/* Deposit section - always visible for members */}
                            <div className="deposit-section">
                              <label className="deposit-label">Deposit ({currency})</label>
                              <input
                                type="number"
                                placeholder={`Amount in ${currency}`}
                                value={showGroupDetail === group.id ? groupDepositAmount : ''}
                                onChange={(e) => {
                                  setShowGroupDetail(group.id);
                                  setGroupDepositAmount(e.target.value);
                                }}
                                min="1"
                                step="1"
                                className="deposit-input"
                              />
                              <button
                                onClick={() => {
                                  const fiatAmt = groupDepositAmount;
                                  if (fiatAmt && fiatAmt > 0) {
                                    const oooweeeAmt = convertFiatToOooweee(fiatAmt, currency);
                                    if (oooweeeAmt > 0) {
                                      depositToGroupAccount(group.id, oooweeeAmt.toString());
                                    } else {
                                      toast.error('Amount too small');
                                    }
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
                  </div>
                )}

                {/* Completed Groups */}
                {userGroups.filter(g => g.isMember && !g.isActive).length > 0 && (
                  <div className="completed-section" style={{ marginTop: '1rem' }}>
                    <h3>✅ Completed Group Accounts</h3>
                    <div className="accounts-grid">
                      {userGroups.filter(g => g.isMember && !g.isActive).map(group => {
                        const currency = getCurrencyFromCode(group.targetCurrency);
                        return (
                          <div key={`group-done-${group.id}`} className="account-card completed group-card">
                            <div className="account-header">
                              <h3>{group.goalName}</h3>
                              <div className="header-badges">
                                <span className={`account-type ${group.accountType.toLowerCase()}`}>
                                  👥 {group.accountType}
                                </span>
                                <span className="currency-badge">{currency}</span>
                              </div>
                            </div>
                            <div className="account-details">
                              <p className="completed-text">🏆 Group Goal Complete!</p>
                              <div className="detail-row">
                                <span>Final Balance:</span>
                                <span className="value">{parseFloat(group.totalContributions || group.totalBalance).toLocaleString()} $OOOWEEE</span>
                              </div>
                              <div className="detail-row">
                                <span>Members:</span>
                                <span className="value">{group.memberCount}</span>
                              </div>
                              <div className="detail-row">
                                <span>Your Contribution:</span>
                                <span className="value">{parseFloat(group.myContribution).toLocaleString()} $OOOWEEE</span>
                              </div>
                              <div className="progress-section">
                                <div className="progress-bar">
                                  <div className="progress-fill rainbow-fill" style={{ width: '100%' }} />
                                </div>
                                <span className="progress-text">100% Complete ✨</span>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {completedAccounts.length > 0 && (
                  <>
                    <div className="toggle-completed">
                      <button onClick={() => setShowCompleted(!showCompleted)} className="toggle-btn">
                        {showCompleted ? '📦 Hide' : '👁️ Show'} Completed ({completedAccounts.length})
                      </button>
                    </div>
                    
                    {showCompleted && (
                      <div className="completed-section">
                        <h3>✅ Completed Accounts</h3>
                        <div className="accounts-grid">
                          {completedAccounts.map(acc => {
                            const currency = getCurrencyFromCode(acc.targetCurrency);
                            const currencyInfo = CURRENCIES[currency];
                            
                            return (
                              <div key={acc.id} className={`account-card completed ${acc.type === 'Time' ? 'time-lock' : acc.type === 'Growth' ? 'growth-goal' : 'balance-transfer'}`}>
                                <div className="account-header">
                                  <h3>{acc.goalName}</h3>
                                  <div className="header-badges">
                                    <span className={`account-type ${acc.type.toLowerCase()}`}>
                                      {acc.type}
                                    </span>
                                    <span className="currency-badge">{currency}</span>
                                  </div>
                                </div>
                                
                                <div className="account-details">
                                  <p className="completed-text">🏆 Goal Complete!</p>
                                  
                                  {(acc.type === 'Growth' || acc.type === 'Balance') && acc.targetFiat > 0 && (
                                    <div className="detail-row">
                                      <span>Target Reached:</span>
                                      <span className="value">
                                        {currencyInfo.symbol}
                                        {(acc.targetFiat / Math.pow(10, currencyInfo.decimals)).toFixed(2)}
                                      </span>
                                    </div>
                                  )}
                                  {acc.closingBalance && (
                                    <div className="detail-row">
                                      <span>Closing Balance:</span>
                                      <span className="value">
                                        {!showFiat
                                          ? `${parseFloat(acc.balance).toLocaleString()} $OOOWEEE`
                                          : `${currencyInfo.symbol}${(acc.currentFiatValue / Math.pow(10, currencyInfo.decimals)).toFixed(2)}`
                                        }
                                      </span>
                                    </div>
                                  )}

                                  {acc.type === 'Time' && acc.unlockTime > 0 && (
                                    <div className="detail-row secondary">
                                      <span>Unlocked:</span>
                                      <span className="value">
                                        {new Date(acc.unlockTime * 1000).toLocaleDateString()}
                                      </span>
                                    </div>
                                  )}
                                  
                                  {acc.type === 'Balance' && acc.recipient && (
                                    <div className="detail-row secondary">
                                      <span>Sent to:</span>
                                      <span className="value address">
                                        {acc.recipient.slice(0, 6)}...{acc.recipient.slice(-4)}
                                      </span>
                                    </div>
                                  )}
                                  
                                  <div className="progress-section">
                                    <div className="progress-bar">
                                      <div 
                                        className="progress-fill rainbow-fill"
                                        style={{ width: '100%' }}
                                      />
                                    </div>
                                    <span className="progress-text">100% Complete ✨</span>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </>
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