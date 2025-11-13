import React, { useState, useEffect, useCallback } from 'react';
import { ethers } from 'ethers';
import toast, { Toaster } from 'react-hot-toast';
import './App.css';
import oooweeLogo from './assets/oooweee-logo.png';
import { OOOWEEE_TOKEN_ABI, OOOWEEE_SAVINGS_ABI, OOOWEEE_VALIDATOR_FUND_ABI, OOOWEEE_STABILITY_ABI, CONTRACT_ADDRESSES } from './contracts/abis';
import Web3Modal from "web3modal";
import WalletConnectProvider from "@walletconnect/web3-provider";

// Uniswap Router ABI (minimal)
const UNISWAP_ROUTER_ABI = [
  "function swapExactETHForTokens(uint amountOutMin, address[] calldata path, address to, uint deadline) external payable returns (uint[] memory amounts)",
  "function getAmountsOut(uint amountIn, address[] calldata path) public view returns (uint[] memory amounts)",
  "function WETH() external pure returns (address)"
];

// Contract addresses
const UNISWAP_ROUTER = "0xC532a74256D3Db42D0Bf7a0400fEFDbad7694008";
const WETH_ADDRESS = "0x7b79995e5f793A07Bc00c21412e50Ecae098E7f9";

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
  
  // Validator stats - Updated for new contract
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

  // Circuit breaker status - NEW
  const [circuitBreakerStatus, setCircuitBreakerStatus] = useState({
    tripStatus: false,
    dailyInterventions: 0,
    dailyTokensUsed: '0',
    maxInterventions: 10,
    maxTokens: '1000000',
    timeUntilReset: 0
  });
  
  // Price tracking
  const [oooweeePrice, setOooweeePrice] = useState(0.00001);
  
  // Initialize on load
  useEffect(() => {
    const init = async () => {
      setIsAppLoading(true);
      
      // Initialize Web3Modal
      const web3ModalInstance = new Web3Modal({
        cacheProvider: true,
        providerOptions
      });
      
      setWeb3Modal(web3ModalInstance);
      
      // Check if wallet was previously connected
      if (web3ModalInstance.cachedProvider) {
        await connectWallet();
      }
      
      // Fetch ETH prices
      try {
        const response = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd,eur,gbp,jpy,cny,cad,aud,chf,inr,krw');
        const data = await response.json();
        setEthPrice(data.ethereum);
      } catch (error) {
        console.error('Error fetching ETH price:', error);
        setEthPrice({ usd: 2000, eur: 1850, gbp: 1600, jpy: 280000, cny: 14000, cad: 2600, aud: 3000, chf: 1800, inr: 165000, krw: 2600000 });
      }
      
      setTimeout(() => setIsAppLoading(false), 2000);
    };
    
    init();
  }, []);
  
  // Format currency
  const formatCurrency = (amount, currency = 'eur') => {
    const curr = Object.entries(CURRENCIES).find(([_, info]) => info.code === currency) || ['EUR', CURRENCIES.EUR];
    const locale = curr[1].locale;
    const symbol = curr[1].symbol;
    
    return new Intl.NumberFormat(locale, {
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
      const path = [WETH_ADDRESS, CONTRACT_ADDRESSES.token];
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

  // Estimate OOOWEEE output
  useEffect(() => {
    const estimateOooweee = async () => {
      if (!routerContract || !ethToBuy || parseFloat(ethToBuy) <= 0) {
        setEstimatedOooweee('0');
        return;
      }
      
      try {
        const ethAmount = ethers.utils.parseEther(ethToBuy);
        const path = [WETH_ADDRESS, CONTRACT_ADDRESSES.token];
        const amounts = await routerContract.getAmountsOut(ethAmount, path);
        setEstimatedOooweee(ethers.utils.formatUnits(amounts[1], 18));
      } catch (error) {
        setEstimatedOooweee('0');
      }
    };
    
    estimateOooweee();
  }, [ethToBuy, routerContract]);

  // Load validator stats - UPDATED for new contract
  const loadValidatorStats = useCallback(async () => {
    try {
      const stats = await validatorFundContract.getStats();
      const ethNeeded = await validatorFundContract.ethUntilNextValidator();
      const [progress] = await validatorFundContract.progressToNextValidator();
      
      setValidatorStats({
        validators: stats[0].toString(),
        nextValidatorIn: ethers.utils.formatEther(ethNeeded),
        progress: (parseFloat(ethers.utils.formatEther(progress)) / 32) * 100,
        pendingETH: ethers.utils.formatEther(stats[1]),
        totalDonations: ethers.utils.formatEther(stats[4]),
        donors: stats[5].toString(),
        fromStability: ethers.utils.formatEther(stats[6]), // NEW
        fromRewards: ethers.utils.formatEther(stats[7])    // NEW
      });
    } catch (error) {
      console.error('Error loading validator stats:', error);
    }
  }, [validatorFundContract]);

  // Load circuit breaker status - NEW
  const loadCircuitBreakerStatus = useCallback(async () => {
    if (!stabilityContract) return;
    
    try {
      const status = await stabilityContract.getCircuitBreakerStatus();
      setCircuitBreakerStatus({
        tripStatus: status[0],
        dailyInterventions: status[1].toNumber(),
        dailyTokensUsed: ethers.utils.formatUnits(status[2], 18),
        maxInterventions: status[3].toNumber(),
        maxTokens: ethers.utils.formatUnits(status[4], 18),
        timeUntilReset: status[5].toNumber()
      });
    } catch (error) {
      console.error('Error loading circuit breaker status:', error);
    }
  }, [stabilityContract]);

  // Load validator stats
  useEffect(() => {
    if (validatorFundContract) {
      loadValidatorStats();
      const interval = setInterval(loadValidatorStats, 10000);
      return () => clearInterval(interval);
    }
  }, [validatorFundContract, loadValidatorStats]);

  // Load circuit breaker status
  useEffect(() => {
    if (stabilityContract) {
      loadCircuitBreakerStatus();
      const interval = setInterval(loadCircuitBreakerStatus, 15000);
      return () => clearInterval(interval);
    }
  }, [stabilityContract, loadCircuitBreakerStatus]);

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

  // Buy OOOWEEE with ETH
  const buyOooweee = async () => {
    if (!ethToBuy || parseFloat(ethToBuy) <= 0) {
      toast.error('Enter a valid ETH amount');
      return;
    }
    
    try {
      setLoading(true);
      
      const ethAmount = ethers.utils.parseEther(ethToBuy);
      const path = [WETH_ADDRESS, CONTRACT_ADDRESSES.token];
      const deadline = Math.floor(Date.now() / 1000) + 3600;
      
      // Get minimum output (with 3% slippage to match contracts)
      const amounts = await routerContract.getAmountsOut(ethAmount, path);
      const minOutput = amounts[1].mul(97).div(100);
      
      const tx = await routerContract.swapExactETHForTokens(
        minOutput,
        path,
        account,
        deadline,
        { value: ethAmount }
      );
      
      await toast.promise(
        tx.wait(),
        {
          loading: '🔄 Swapping ETH for OOOWEEE...',
          success: `🎉 Bought ${parseFloat(estimatedOooweee).toFixed(2)} OOOWEEE!`,
          error: '❌ Swap failed'
        }
      );
      
      setShowBuyModal(false);
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

  // Buy and create account
  const buyAndCreateAccount = async (requiredOooweee) => {
    const requiredEth = requiredOooweee * oooweeePrice * 1.05; // Add 5% buffer
    
    const result = await toast.promise(
      new Promise(async (resolve, reject) => {
        try {
          setLoading(true);
          
          const ethAmount = ethers.utils.parseEther(requiredEth.toFixed(6));
          const path = [WETH_ADDRESS, CONTRACT_ADDRESSES.token];
          const deadline = Math.floor(Date.now() / 1000) + 3600;
          
          const amounts = await routerContract.getAmountsOut(ethAmount, path);
          const minOutput = amounts[1].mul(97).div(100); // 3% slippage
          
          const tx = await routerContract.swapExactETHForTokens(
            minOutput,
            path,
            account,
            deadline,
            { value: ethAmount }
          );
          
          await tx.wait();
          await loadBalances(account, provider, tokenContract);
          resolve(true);
        } catch (error) {
          reject(error);
        }
      }),
      {
        loading: `🔄 Buying ${requiredOooweee.toFixed(0)} OOOWEEE...`,
        success: '✅ OOOWEEE purchased! Creating account...',
        error: '❌ Failed to buy OOOWEEE'
      }
    );
    
    return result;
  };

  // Connect wallet
  const connectWallet = async () => {
    try {
      setLoading(true);
      
      if (!web3Modal) {
        toast.error('Web3Modal not initialized');
        return;
      }
      
      const instance = await web3Modal.connect();
      const web3Provider = new ethers.providers.Web3Provider(instance);
      const signer = web3Provider.getSigner();
      const address = await signer.getAddress();
      
      // Check network
      const network = await web3Provider.getNetwork();
      if (network.chainId !== 11155111) {
        toast.error('Please switch to Sepolia network');
        setLoading(false);
        return;
      }
      
      // Initialize contracts - UPDATED
      const token = new ethers.Contract(CONTRACT_ADDRESSES.token, OOOWEEE_TOKEN_ABI, signer);
      const savings = new ethers.Contract(CONTRACT_ADDRESSES.savings, OOOWEEE_SAVINGS_ABI, signer);
      const validatorFund = new ethers.Contract(CONTRACT_ADDRESSES.validatorFund, OOOWEEE_VALIDATOR_FUND_ABI, signer);
      const stability = new ethers.Contract(CONTRACT_ADDRESSES.stability, OOOWEEE_STABILITY_ABI, signer);
      const router = new ethers.Contract(UNISWAP_ROUTER, UNISWAP_ROUTER_ABI, signer);
      
      setAccount(address);
      setProvider(web3Provider);
      setTokenContract(token);
      setSavingsContract(savings);
      setValidatorFundContract(validatorFund);
      setStabilityContract(stability);
      setRouterContract(router);
      
      // Load user data
      await loadBalances(address, web3Provider, token);
      await loadSavingsAccounts(address, savings);
      
      // Subscribe to events
      if (instance.on) {
        instance.on("accountsChanged", handleAccountsChanged);
        instance.on("chainChanged", handleChainChanged);
      }
      
      toast.success('Wallet connected!');
    } catch (error) {
      console.error(error);
      toast.error('Failed to connect wallet');
    } finally {
      setLoading(false);
    }
  };

  // Handle account change
  const handleAccountsChanged = async (accounts) => {
    if (accounts.length === 0) {
      disconnectWallet();
    } else {
      window.location.reload();
    }
  };

  // Handle chain change
  const handleChainChanged = (chainId) => {
    window.location.reload();
  };

  // Donate to validators
  const donateToValidators = async () => {
    const amount = prompt('Enter ETH amount to donate:');
    if (amount && parseFloat(amount) > 0) {
      try {
        setLoading(true);
        const tx = await validatorFundContract.donate({ 
          value: ethers.utils.parseEther(amount) 
        });
        
        await toast.promise(
          tx.wait(),
          {
            loading: '💰 Sending donation...',
            success: `🎉 Donated ${amount} ETH to validator fund!`,
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
    setValidatorFundContract(null);
    setStabilityContract(null);
    setRouterContract(null);
    setBalance('0');
    setEthBalance('0');
    setAccounts([]);
  };

  const loadBalances = async (account, provider, tokenContract) => {
    try {
      const tokenBal = await tokenContract.balanceOf(account);
      setBalance(ethers.utils.formatUnits(tokenBal, 18));
      
      const ethBal = await provider.getBalance(account);
      setEthBalance(ethers.utils.formatEther(ethBal));
    } catch (error) {
      console.error('Error loading balances:', error);
    }
  };

  const loadSavingsAccounts = async (account, savingsContract) => {
    try {
      const accountIds = await savingsContract.getUserAccounts(account);
      const accountDetails = [];
      
      for (let id of accountIds) {
        try {
          // Try to get extended info first
          const info = await savingsContract.getAccountInfoExtended(account, id);
          accountDetails.push({
            id: id.toString(),
            type: info[0],
            goalName: info[1],
            balance: ethers.utils.formatUnits(info[2], 18),
            target: ethers.utils.formatUnits(info[3], 18),
            targetFiat: info[4].toNumber(),
            targetCurrency: info[5],
            currentFiatValue: info[6].toNumber(),
            unlockTime: info[7].toNumber(), // Now uint32
            recipient: info[8],
            isActive: info[9],
            progress: info[10].toString(),
            pendingRewards: ethers.utils.formatUnits(info[11], 18),
            isFiatTarget: info[12]
          });
        } catch (extendedError) {
          // Fall back to legacy getAccountInfo
          const info = await savingsContract.getAccountInfo(account, id);
          accountDetails.push({
            id: id.toString(),
            type: info[0],
            goalName: info[1],
            balance: ethers.utils.formatUnits(info[2], 18),
            target: ethers.utils.formatUnits(info[3], 18),
            targetFiat: 0,
            targetCurrency: 1, // Default to EUR
            currentFiatValue: 0,
            unlockTime: info[4].toNumber(),
            recipient: info[5],
            isActive: info[6],
            progress: info[7].toString(),
            pendingRewards: ethers.utils.formatUnits(info[8], 18),
            isFiatTarget: false
          });
        }
      }
      
      setAccounts(accountDetails);
    } catch (error) {
      console.error('Error loading accounts:', error);
    }
  };

  // Claim rewards for an account - NEW
  const claimRewards = async (accountId) => {
    try {
      setLoading(true);
      
      const tx = await savingsContract.claimRewards(accountId);
      
      await toast.promise(
        tx.wait(),
        {
          loading: '🎁 Claiming rewards...',
          success: '✅ Rewards claimed!',
          error: '❌ Failed to claim rewards'
        }
      );
      
      await loadSavingsAccounts(account, savingsContract);
      
    } catch (error) {
      console.error(error);
      toast.error('Failed to claim rewards');
    } finally {
      setLoading(false);
    }
  };

  // Claim all rewards - NEW
  const claimAllRewards = async () => {
    try {
      setLoading(true);
      
      const tx = await savingsContract.claimAllRewards();
      
      await toast.promise(
        tx.wait(),
        {
          loading: '🎁 Claiming all rewards (max 20 accounts)...',
          success: '✅ All rewards claimed!',
          error: '❌ Failed to claim rewards'
        }
      );
      
      await loadSavingsAccounts(account, savingsContract);
      
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
      
      // Check if user has enough OOOWEEE
      if (parseFloat(balance) < parseFloat(initialDeposit)) {
        const needed = parseFloat(initialDeposit) - parseFloat(balance);
        
        if (window.confirm(`You need ${needed.toFixed(2)} more OOOWEEE. Buy with ETH now?`)) {
          await buyAndCreateAccount(needed);
        } else {
          setLoading(false);
          return;
        }
      }
      
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
      
      const createTx = await savingsContract.createTimeAccountFiat(
        unlockTime,
        goalName,
        depositAmount,
        CURRENCIES[currency].code
      );
      
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

  const createGrowthAccount = async (targetAmount, goalName, initialDeposit, currency) => {
    try {
      setLoading(true);
      
      // Check if user has enough OOOWEEE
      if (parseFloat(balance) < parseFloat(initialDeposit)) {
        const needed = parseFloat(initialDeposit) - parseFloat(balance);
        
        if (window.confirm(`You need ${needed.toFixed(2)} more OOOWEEE. Buy with ETH now?`)) {
          await buyAndCreateAccount(needed);
        } else {
          setLoading(false);
          return;
        }
      }
      
      // Convert target to smallest unit (cents, pence, etc)
      const targetInSmallestUnit = Math.round(targetAmount * Math.pow(10, CURRENCIES[currency].decimals));
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
      
      const createTx = await savingsContract.createGrowthAccountFiat(
        targetInSmallestUnit,
        CURRENCIES[currency].code,
        goalName,
        depositAmount
      );
      
      await toast.promise(
        createTx.wait(),
        {
          loading: '🌱 Planting money tree...',
          success: `🎉 Growth account created! Target: ${CURRENCIES[currency].symbol}${targetAmount}`,
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

  const createBalanceAccount = async (targetAmount, recipientAddress, goalName, initialDeposit, currency) => {
    try {
      setLoading(true);
      
      // Check if user has enough OOOWEEE
      if (parseFloat(balance) < parseFloat(initialDeposit)) {
        const needed = parseFloat(initialDeposit) - parseFloat(balance);
        
        if (window.confirm(`You need ${needed.toFixed(2)} more OOOWEEE. Buy with ETH now?`)) {
          await buyAndCreateAccount(needed);
        } else {
          setLoading(false);
          return;
        }
      }
      
      // Convert target to smallest unit
      const targetInSmallestUnit = Math.round(targetAmount * Math.pow(10, CURRENCIES[currency].decimals));
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
      
      const createTx = await savingsContract.createBalanceAccountFiat(
        targetInSmallestUnit,
        CURRENCIES[currency].code,
        recipientAddress,
        goalName,
        depositAmount
      );
      
      await toast.promise(
        createTx.wait(),
        {
          loading: '⚖️ Setting up balance account...',
          success: `🎉 Balance account created! Will send to ${recipientAddress.slice(0,6)}...`,
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
      
      // Check if user has enough OOOWEEE
      if (currentBalance < depositAmountNumber) {
        const needed = depositAmountNumber - currentBalance;
        
        if (window.confirm(`You need ${needed.toFixed(2)} more OOOWEEE. Buy with ETH now?`)) {
          const requiredEth = needed * oooweeePrice * 1.05; // 5% buffer for slippage
          
          // Check ETH balance
          if (parseFloat(ethBalance) < requiredEth) {
            toast.error(`Insufficient ETH. Need ${requiredEth.toFixed(4)} ETH`);
            setLoading(false);
            return;
          }
          
          const ethAmount = ethers.utils.parseEther(requiredEth.toFixed(6));
          const path = [WETH_ADDRESS, CONTRACT_ADDRESSES.token];
          const deadline = Math.floor(Date.now() / 1000) + 3600;
          
          // Get expected output with slippage - FIXED: Remove unused variable
          const minOutput = ethers.utils.parseUnits(needed.toFixed(0), 18).mul(97).div(100);
          
          const buyTx = await routerContract.swapExactETHForTokens(
            minOutput,
            path,
            account,
            deadline,
            { value: ethAmount }
          );
          
          await toast.promise(
            buyTx.wait(),
            {
              loading: `🔄 Buying ${needed.toFixed(0)} OOOWEEE...`,
              success: '✅ OOOWEEE purchased!',
              error: '❌ Failed to buy OOOWEEE'
            }
          );
          
          // Reload balance after purchase
          await loadBalances(account, provider, tokenContract);
        } else {
          setLoading(false);
          return;
        }
      }
      
      // Now deposit the originally requested amount
      const depositAmount = ethers.utils.parseUnits(depositAmountNumber.toString(), 18);
      
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
          loading: `💰 Depositing ${depositAmountNumber} OOOWEEE...`,
          success: `🎉 Deposited ${depositAmountNumber} $OOOWEEE!`,
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

  // Get currency code from number
  const getCurrencyFromCode = (code) => {
    const currencies = Object.keys(CURRENCIES);
    return currencies[code] || 'EUR';
  };

  // Format time until reset
  const formatTimeRemaining = (seconds) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${hours}h ${minutes}m`;
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

  // Buy Modal
  const BuyModal = () => (
    <div className="modal-overlay" onClick={() => setShowBuyModal(false)}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <h2>🛒 Buy $OOOWEEE</h2>
        <button className="close-modal" onClick={() => setShowBuyModal(false)}>✕</button>
        
        <div className="buy-form">
          <div className="balance-info">
            <p>ETH Balance: {parseFloat(ethBalance).toFixed(4)} ETH</p>
            <p>Current Rate: 1 ETH = {(1/oooweeePrice).toFixed(0)} OOOWEEE</p>
          </div>
          
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
              <p className="fiat-value">
                ≈ {getOooweeeInFiat(estimatedOooweee, 'eur')}
              </p>
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
        </div>
      </div>
    </div>
  );

  // Circuit Breaker Card - NEW
  const CircuitBreakerCard = () => (
    <div className="circuit-breaker-card">
      <div className="card-header">
        <h3>🚨 Stability System</h3>
        <span className={`status-badge ${circuitBreakerStatus.tripStatus ? 'paused' : 'active'}`}>
          {circuitBreakerStatus.tripStatus ? '⚠️ Paused' : '✅ Active'}
        </span>
      </div>
      
      <div className="stats-grid">
        <div className="stat">
          <span className="label">Daily Interventions</span>
          <span className="value">
            {circuitBreakerStatus.dailyInterventions}/{circuitBreakerStatus.maxInterventions}
          </span>
        </div>
        
        <div className="stat">
          <span className="label">Tokens Used Today</span>
          <span className="value">
            {parseFloat(circuitBreakerStatus.dailyTokensUsed).toLocaleString()}/
            {parseFloat(circuitBreakerStatus.maxTokens).toLocaleString()}
          </span>
        </div>
        
        {circuitBreakerStatus.timeUntilReset > 0 && (
          <div className="stat">
            <span className="label">Resets In</span>
            <span className="value">{formatTimeRemaining(circuitBreakerStatus.timeUntilReset)}</span>
          </div>
        )}
      </div>
      
      <div className="progress-bar">
        <div 
          className="progress-fill"
          style={{ 
            width: `${(circuitBreakerStatus.dailyInterventions / circuitBreakerStatus.maxInterventions) * 100}%`,
            background: circuitBreakerStatus.tripStatus ? '#ff4444' : 'var(--oooweee-green)'
          }}
        />
      </div>
    </div>
  );

  // About page content
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
      
      {/* Buy Modal */}
      {showBuyModal && <BuyModal />}
      
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
                <p className="disclaimer">💡 Values shown in your selected currency are estimates based on current market rates</p>
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
                    
                    <div className="balance-row">
                      <span>ETH:</span>
                      <span>{parseFloat(ethBalance).toFixed(4)} ETH</span>
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
                    
                    {parseFloat(balance) === 0 && (
                      <div className="zero-balance-notice">
                        <p>👋 No OOOWEEE yet? Get started!</p>
                      </div>
                    )}
                    
                    <button 
                      className="add-oooweee-btn rainbow-btn"
                      onClick={() => setShowBuyModal(true)}
                    >
                      🛒 Buy $OOOWEEE
                    </button>
                  </div>

                  {/* Validator Card - UPDATED */}
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
                      
                      <div className="stat">
                        <span className="label">From Stability</span>
                        <span className="value">{parseFloat(validatorStats.fromStability).toFixed(4)} ETH</span>
                      </div>
                      
                      <div className="stat">
                        <span className="label">From Rewards</span>
                        <span className="value">{parseFloat(validatorStats.fromRewards).toFixed(4)} ETH</span>
                      </div>
                    </div>
                    
                    <div className="progress-bar">
                      <div 
                        className="progress-fill validator-progress"
                        style={{ width: `${validatorStats.progress}%` }}
                      />
                    </div>
                    <p className="progress-label">
                      {parseFloat(validatorStats.pendingETH).toFixed(4)} / 32 ETH
                    </p>
                    
                    <div className="donation-stats">
                      <p>💝 Total Donations: {parseFloat(validatorStats.totalDonations).toFixed(4)} ETH</p>
                      <p>👥 Donors: {validatorStats.donors}</p>
                    </div>
                    
                    <button 
                      className="donate-btn"
                      onClick={donateToValidators}
                      disabled={loading}
                    >
                      💰 Donate ETH
                    </button>
                  </div>

                  {/* Circuit Breaker Card - NEW */}
                  {stabilityContract && <CircuitBreakerCard />}
                </div>

                <div className="savings-section">
                  {activeAccounts.length > 0 && (
                    <>
                      <div className="section-header">
                        <h2>🎮 Your Active Quests</h2>
                        {activeAccounts.some(acc => parseFloat(acc.pendingRewards) > 0) && (
                          <button 
                            className="claim-all-btn"
                            onClick={claimAllRewards}
                            disabled={loading}
                          >
                            🎁 Claim All Rewards
                          </button>
                        )}
                      </div>
                      <div className="accounts-grid">
                        {activeAccounts.map(acc => {
                          const currency = getCurrencyFromCode(acc.targetCurrency);
                          const currencyInfo = CURRENCIES[currency];
                          
                          return (
                            <div key={acc.id} className="account-card">
                              <div className="account-header">
                                <h3>{acc.goalName}</h3>
                                <span className={`account-type ${acc.type.toLowerCase()}`}>
                                  {acc.type}
                                </span>
                              </div>
                              
                              <div className="account-details">
                                {acc.isFiatTarget ? (
                                  <>
                                    <div className="fiat-target-display">
                                      {(acc.type === 'Growth' || acc.type === 'Balance') && (
                                        <div className="detail-row">
                                          <span>Target:</span>
                                          <span className="primary-amount">
                                            {currencyInfo.symbol}
                                            {(acc.targetFiat / Math.pow(10, currencyInfo.decimals)).toFixed(currencyInfo.decimals)}
                                          </span>
                                        </div>
                                      )}
                                      
                                      <div className="detail-row">
                                        <span>Current Value:</span>
                                        <span className="primary-amount">
                                          {currencyInfo.symbol}
                                          {(acc.currentFiatValue / Math.pow(10, currencyInfo.decimals)).toFixed(currencyInfo.decimals)}
                                        </span>
                                      </div>
                                      
                                      <div className="balance-in-tokens">
                                        <span className="secondary-amount">
                                          {parseFloat(acc.balance).toLocaleString()} $OOOWEEE
                                        </span>
                                      </div>
                                    </div>
                                  </>
                                ) : (
                                  <>
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
                                          <button 
                                            className="claim-btn"
                                            onClick={() => claimRewards(acc.id)}
                                            disabled={loading}
                                          >
                                            Claim
                                          </button>
                                        </div>
                                      )}
                                      {displayCurrency === 'fiat' && (
                                        <span className="secondary-amount">
                                          ≈ {parseFloat(acc.balance).toLocaleString()} $OOOWEEE
                                        </span>
                                      )}
                                    </div>
                                  </>
                                )}
                                
                                {acc.type === 'Time' && (
                                  <div className="detail-row">
                                    <span>Days Remaining:</span>
                                    <span className="value">{getDaysRemaining(acc.unlockTime)}</span>
                                  </div>
                                )}
                                
                                {acc.type === 'Growth' && !acc.isFiatTarget && (
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
                                    {!acc.isFiatTarget && (
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
                  
                  {/* Currency selector for all account types */}
                  <div className="form-group">
                    <label>💱 Display Currency:</label>
                    <select 
                      value={accountCurrency}
                      onChange={(e) => setAccountCurrency(e.target.value)}
                      className="select-input"
                    >
                      {Object.entries(CURRENCIES).map(([code, info]) => (
                        <option key={code} value={code}>
                          {info.symbol} {info.name}
                        </option>
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
                    {parseFloat(balance) < parseFloat(initialDepositInput) && initialDepositInput && (
                      <p className="swap-notice">
                        ⚠️ Insufficient balance - will offer to buy with ETH
                      </p>
                    )}
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
                    onClick={handleCreateAccount} 
                    disabled={loading}
                    className="create-btn rainbow-btn"
                  >
                    {loading ? '⏳ Processing...' : '🚀 Create Account'}
                  </button>
                </div>
                
                {completedAccounts.length > 0 && (
                  <div className="toggle-completed">
                    <button 
                      onClick={() => setShowCompleted(!showCompleted)}
                      className="toggle-btn"
                    >
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