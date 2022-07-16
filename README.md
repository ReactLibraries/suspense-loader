# @react-libraries/suspense-loader

## Overview

This library handles SSR/SSR-Streaming/CSR in Next.js  
RSC is not used for SSR-Streaming

Next.js 12.2.x has a bug that prevents streaming from working, so please use the 12.1.6 system.

## Sample

<https://next-streaming.vercel.app/>

## Usage

At the moment, we need to include React18 as follows

```bash
yarn add react/rc react-dom/rc
```

- next.config.js

```js
/**
 * @type { import("next").NextConfig}
 */
const config = {
  experimental: {
    runtime: 'edge',
  },
};
module.exports = config;
```

The library is also compatible with React17, so it works, except that SSR-Streaming is not available

## Explanation of each function

- SuspenseLoader component

| Name        | Required | default     | Description                                                    |
| ----------- | :------: | ----------- | -------------------------------------------------------------- |
| dispatch    |          |             | Store the dispatch for reloading Ref                           |
| name        |    \*    |             | Name for data cache management                                 |
| loader      |    \*    |             | Data acquisition process that returns a Promise                |
| loaderValue |          |             | Parameters sent to loader                                      |
| fallback    |          |             | Component to be displayed during loading                       |
| onLoaded    |          |             | Event to be called after data acquisition is complete          |
| type        |          | 'streaming' | Behavior during data acquisition <br/> 'ssr','streaming','csr' |

- Example loader

```tsx
const loader = ({ type }: { type: string; wait: number }): Promise<unknown | undefined> =>
  fetch(`https://hacker-news.firebaseio.com/v0/${type}.json`)
    .then((v) => v.json())
    .catch(() => undefined);

<SuspenseLoader loader={loader} loaderValue={{ type: 'topstories' }} {...props}>
  <Component />
</SuspenseLoader>;
```

- How to retrieve the data

```tsx
const Component = () => {
  const value = useSuspenseData<number[]>(); //Execution result of the Loader
  const dispatch = useSuspenseDispatch(); //dispatch for reloading
  return (
    <div>
      <div onClick={() => dispatch()}>Reload</div>
      <div>{JSON.stringify(value)}</div>
    </div>
  );
};

<SuspenseLoader {...props}>
  <Component />
</SuspenseLoader>;
```

- When passing data directly

```tsx
<SuspenseLoader {...props}>
  {(value, dispatch) => (
    <div>
      <div onClick={() => dispatch()}>Reload</div>
      <div>{JSON.stringify(value)}</div>
    </div>
  )}
</SuspenseLoader>
```

- Work to use regular SSRs.

pages/\_app.tsx

Required only if type="ssr" is used.

```tsx
import { AppContext, AppProps } from 'next/app';
import React from 'react';
import {
  getDataFromTree,
  setSuspenseTreeContext,
  SuspenseTreeContextType,
} from '@react-libraries/suspense-loader';

const App = (props: AppProps & { context: SuspenseTreeContextType }) => {
  const { Component, context } = props;
  setSuspenseTreeContext(context);
  return <Component />;
};

App.getInitialProps = async ({ Component, router, AppTree }: AppContext) => {
  const context = await getDataFromTree(
    <AppTree Component={Component} pageProps={{}} router={router} />,
    1400 // fetch-timeout(Set to within 1500ms when using Vercel.)
  );
  return { context };
};
export default App;
```

## Example

<https://github.com/SoraKumo001/next-streaming>

```tsx
import { useRef } from 'react';
import { NewsWithData } from '../components/NewsWithData';
import { SuspenseDispatch, SuspenseLoader, SuspenseType } from '@react-libraries/suspense-loader';
import { loader } from '../libs/loader';
import { Spinner } from '../components/Spinner';

const News = ({ wait, type }: { wait: number; type: SuspenseType }) => {
  const dispatch = useRef<SuspenseDispatch>();
  return (
    <>
      <div>
        <button
          onClick={() => {
            location.reload();
          }}
        >
          Reload(Browser)
        </button>{' '}
        <button
          onClick={() => {
            dispatch.current!();
          }}
        >
          Reload(CSR)
        </button>
      </div>
      <hr />
      <SuspenseLoader
        dispatch={dispatch} //Dispatch for reloading
        name="news" //Name the SSR transfer data.
        loader={loader} //A loader that returns a Promise
        loaderValue={{ type: 'topstories', wait }} //Parameters to be passed to the loader (can be omitted if not needed)
        fallback={<Spinner />} //Components to be displayed while loading
        onLoaded={() => console.log('Loading complete')} //Events that occur after loading is complete
        type={type}
      >
        {
          //To retrieve data, useSuspenseData in the component.
        }
        <NewsWithData wait={wait} type={type} />
      </SuspenseLoader>
    </>
  );
};
export default News;
```

```tsx
import { loader } from '../libs/loader';
import { Story } from './Story';
import { SuspenseLoader, SuspenseType, useSuspenseData } from '.@react-libraries/suspense-loader';
import { Spinner } from './Spinner';

export const NewsWithData = ({ wait, type }: { wait: number; type: SuspenseType }) => {
  //Data is passed from SuspenseLoader.
  const storyIds = useSuspenseData<number[] | undefined>();
  if (!storyIds) return null;
  return (
    <>
      {storyIds.slice(0, 30).map((id) => {
        return (
          <SuspenseLoader
            key={id}
            name={`News/${id}`}
            loader={loader}
            loaderValue={{ type: `item/${id}`, wait }}
            fallback={<Spinner />}
            onLoaded={() => console.log(`Loading complete(${id})`)}
            type={type}
          >
            <Story />
          </SuspenseLoader>
        );
      })}
    </>
  );
};
```

```tsx
import { useState } from 'react';
import { useSuspenseData, useSuspenseDispatch } from '@react-libraries/suspense-loader';

export const Story = () => {
  const { id, title, date, url, user, score, commentsCount } = useSuspenseData<{
    id: number;
    title: string;
    date: string;
    url: string;
    user: String;
    score: number;
    commentsCount: number;
  }>();
  const dispatch = useSuspenseDispatch();
  const { host } = url ? new URL(url) : { host: '#' };
  const [voted, setVoted] = useState(false);
  return (
    <div style={{ margin: '5px 0' }}>
      <div className="title">
        <span
          style={{
            cursor: 'pointer',
            fontFamily: 'sans-serif',
            marginRight: 5,
            color: voted ? '#ffa52a' : '#ccc',
          }}
          onClick={() => setVoted(!voted)}
        >
          &#9650;
        </span>
        <a href={url}>{title}</a>
        {url && (
          <span className="source">
            <a href={`http://${host}`}>{host.replace(/^www\./, '')}</a>
          </span>
        )}
      </div>
      <div className="meta">
        {score} {plural(score, 'point')} by <a href={`/user?id=${user}`}>{user}</a>{' '}
        <a href={`/item?id=${id}`}>{date}</a> |{' '}
        <a href={`/item?id=${id}`}>
          {commentsCount} {plural(commentsCount, 'comment')}
        </a>{' '}
        |{' '}
        <a
          style={{
            background: 'lightGray',
            borderRadius: '4px',
            cursor: 'pointer',
          }}
          onClick={() => {
            dispatch();
          }}
        >
          Reload
        </a>
      </div>
    </div>
  );
};
const plural = (n: number, s: string) => s + (n === 0 || n > 1 ? 's' : '');
```
