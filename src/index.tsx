import React, {
  createContext,
  createElement,
  MutableRefObject,
  ReactElement,
  ReactNode,
  Suspense,
  SuspenseProps,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

type SuspensePropeatyType<T, V> = {
  value?: T;
  isInit?: boolean;
  isSuspenseLoad?: boolean;
  loaderValue?: V;
};
type PromiseMap = {
  [key: string]: { streaming: boolean; promise: Promise<unknown> | undefined };
};
const isReact18 = Number(/(\d+)/.exec(React.version)![0]) >= 18;
export type SuspenseType = 'streaming' | 'ssr' | 'csr';
export type SuspenseTreeContextType = {
  promiseMap: {
    [key: string]: {
      streaming: boolean;
      promise: Promise<unknown> | undefined;
    };
  };
  cacheMap: { [key: string]: unknown };
};
export type SuspenseDispatch<T = unknown> = (value?: T) => void;
const isServer = typeof window === 'undefined';
const SuspenseDataContext = createContext<{
  value: unknown;
  dispatch: unknown;
}>(undefined as never);
export const useSuspenseData = <T,>() => useContext(SuspenseDataContext).value as T;
export const useSuspenseDispatch = <V,>() =>
  useContext(SuspenseDataContext).dispatch as SuspenseDispatch<V>;
const SuspenseWapper = <T, V>({
  property,
  idName,
  dispatch,
  children,
  load,
  streaming,
}: {
  property: SuspensePropeatyType<T, V>;
  idName: string;
  dispatch: SuspenseDispatch<V>;
  children: ReactNode | ((value: T, dispatch: SuspenseDispatch<V>) => ReactNode);
  load: () => Promise<unknown>;
  streaming?: boolean;
}) => {
  const { isInit, isSuspenseLoad, value } = property;
  if (!isInit && (isReact18 || !isServer)) throw load();
  const [isRequestData, setRequestData] = useState((isSuspenseLoad || isServer) && streaming);
  useEffect(() => setRequestData(false), []);
  const contextValue = useMemo(() => {
    return { value, dispatch };
  }, [value, dispatch]);
  if (!isInit) {
    load();
    return null;
  }
  return (
    <SuspenseDataContext.Provider value={contextValue}>
      {isRequestData && (
        <script
          id={idName}
          type="application/json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({ value }),
          }}
        />
      )}
      {typeof children === 'function' ? children(value as T, dispatch) : children}
    </SuspenseDataContext.Provider>
  );
};

export const SuspenseLoader = <T, V>({
  name,
  loader,
  loaderValue,
  fallback,
  onLoaded,
  children,
  dispatch,
  type = 'streaming',
}: {
  name: string;
  loader: (value: V) => Promise<T>;
  loaderValue?: V;
  fallback?: SuspenseProps['fallback'];
  onLoaded?: (value: T) => void;
  children: ReactNode | ((value: T, dispatch: SuspenseDispatch<V>) => ReactNode);
  dispatch?: MutableRefObject<SuspenseDispatch<V> | undefined>;
  type: SuspenseType;
}) => {
  const reload = useState({})[1];
  const idName = '#__NEXT_DATA__STREAM__' + name;
  const { promiseMap, cacheMap } = useTreeContext();
  const property = useRef<SuspensePropeatyType<T, V>>({}).current;
  if (!property.isInit) {
    const value = cacheMap[name] as T | undefined;
    if (value) {
      property.value = value;
      property.isInit = true;
      property.isSuspenseLoad = false;
      onLoaded?.(value);
    }
  }
  const load = useCallback(() => {
    const promise =
      (isServer && (promiseMap[name]?.promise as Promise<T>)) ||
      new Promise<T>((resolve) => {
        if (!isServer) {
          const node = document.getElementById(idName);
          if (node) {
            property.isSuspenseLoad = true;
            resolve(JSON.parse(node.innerHTML).value);
            return;
          }
        }
        loader(property.loaderValue || (loaderValue as V)).then((v) => {
          property.isSuspenseLoad = false;
          resolve(v);
        });
      });
    promise.then((value) => {
      property.isInit = true;
      property.value = value;
      cacheMap[name] = value;
      onLoaded?.(value);
    });
    if (isServer) promiseMap[name] = { promise, streaming: type === 'streaming' };

    return promise;
  }, [promiseMap, cacheMap, name, type, loader, property, loaderValue, idName, onLoaded]);
  const loadDispatch = useCallback(
    (value?: V) => {
      property.value = undefined;
      property.isInit = false;
      property.loaderValue = value;
      delete cacheMap[name];
      delete promiseMap[name];
      reload({});
    },
    [cacheMap, name, promiseMap, property, reload]
  );
  if (dispatch) {
    dispatch.current = loadDispatch;
  }
  const [isCSRFallback, setCSRFallback] = useState(type === 'csr');
  useEffect(() => {
    setCSRFallback(false);
  }, []);
  if (isCSRFallback) return <>{fallback}</>;
  if (isServer && !isReact18) {
    if (promiseMap[name] && !property.isInit) return <>{fallback}</>;
    return (
      <>
        <SuspenseWapper<T, V>
          idName={idName}
          property={property}
          dispatch={loadDispatch}
          load={load}
          streaming={!cacheSrcMap[name]}
        >
          {children}
        </SuspenseWapper>
      </>
    );
  }
  return (
    <Suspense fallback={fallback || false}>
      <SuspenseWapper<T, V>
        idName={idName}
        property={property}
        dispatch={loadDispatch}
        load={load}
        streaming={!cacheSrcMap[name]}
      >
        {children}
      </SuspenseWapper>
    </Suspense>
  );
};

const globalTreeContext = {
  promiseMap: {},
  cacheMap: {},
};
let cacheSrcMap: { [key: string]: unknown } = {};
export const setSuspenseTreeContext = (context?: SuspenseTreeContextType) => {
  if (!context) return;
  const { promiseMap, cacheMap } = context;
  globalTreeContext.promiseMap = promiseMap;
  globalTreeContext.cacheMap = cacheMap;
  cacheSrcMap = { ...cacheMap };
};
const TreeContext = createContext<SuspenseTreeContextType>(undefined as never);
const useTreeContext = () => useContext(TreeContext) || globalTreeContext;
export const getDataFromTree = async (
  element: ReactElement,
  timeout?: number
): Promise<SuspenseTreeContextType | undefined> => {
  if (!isServer) return Promise.resolve(undefined);
  const promiseMap: PromiseMap = {};
  const cacheMap: { [key: string]: unknown } = {};
  const ReactDOMServer = require('react-dom/server.browser');
  const isStreaming = 'renderToReadableStream' in ReactDOMServer;
  if (isStreaming) {
    ReactDOMServer.renderToReadableStream(
      createElement(TreeContext.Provider, { value: { promiseMap, cacheMap } }, element)
    );
  } else {
    ReactDOMServer.renderToStaticNodeStream(
      createElement(TreeContext.Provider, { value: { promiseMap, cacheMap } }, element)
    ).read();
  }
  let length = Object.keys(promiseMap).length;
  const promiseTimeout = new Promise((resolve) => timeout && setTimeout(resolve, timeout));
  for (;;) {
    const result = await Promise.race([
      Promise.all(
        Object.values(promiseMap)
          .filter((v) => !isStreaming || !v.streaming)
          .map((v) => v.promise)
      ),
      promiseTimeout,
    ]);
    if (!result) {
      break;
    }

    const newlength = Object.keys(promiseMap).length;
    if (newlength === length) break;
    length = newlength;
  }
  return { cacheMap, promiseMap };
};
